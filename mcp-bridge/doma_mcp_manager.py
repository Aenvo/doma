#!/usr/bin/env python3
"""Narrow native-messaging manager for DomA's local MCP companion.

The browser supplies three companion files bundled with the extension, their
version, and SHA-256 hashes. This host never accepts a URL, path, or shell
command from a message.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


MANAGER_VERSION = "1.1.1"
HOST_NAME = "app.stayfork.doma_mcp_manager"
MANAGED_FILES = ("bridge_auth.py", "doma_mcp_stdio.py", "doma_bridge_daemon.py")
CONTROL_PORT = 3846
MCP_HOME = Path.home() / ".doma" / "mcp"
RELEASE_FILE = MCP_HOME / "release.json"
TOKEN_FILE = MCP_HOME / "bridge-auth-token"
MAX_FILE_BYTES = 256 * 1024
MAX_MESSAGE_BYTES = 1024 * 1024
_LOCAL_HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_VERSION_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
_SHA_RE = re.compile(r"[0-9a-f]{64}\Z")
_EXTENSION_ID_RE = re.compile(r"[a-p]{32}\Z")


def _version(value: Any) -> tuple[int, int, int]:
    if not isinstance(value, str) or not _VERSION_RE.fullmatch(value):
        raise ValueError("invalid release version")
    return tuple(int(part) for part in value.split("."))  # type: ignore[return-value]


def _installed_version() -> str | None:
    try:
        data = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))
        version = data.get("version")
        _version(version)
        return version
    except (OSError, ValueError, AttributeError, TypeError):
        return None


def _control(path: str, method: str = "GET", timeout: float = 1.5) -> dict[str, Any] | None:
    try:
        token = TOKEN_FILE.read_text(encoding="ascii").strip()
        if not _SHA_RE.fullmatch(token):
            return None
        request = urllib.request.Request(
            f"http://127.0.0.1:{CONTROL_PORT}{path}",
            method=method,
            headers={"Authorization": f"Bearer {token}"},
        )
        with _LOCAL_HTTP.open(request, timeout=timeout) as response:
            body = json.load(response)
        return body if isinstance(body, dict) else None
    except (OSError, ValueError, urllib.error.URLError):
        return None


def status() -> dict[str, Any]:
    health = _control("/v1/health")
    try:
        with socket.create_connection(("127.0.0.1", CONTROL_PORT), timeout=0.3):
            port_occupied = True
    except OSError:
        port_occupied = False
    installed = all((MCP_HOME / name).is_file() for name in MANAGED_FILES)
    return {
        "ok": True,
        "managerVersion": MANAGER_VERSION,
        "pythonCommand": sys.executable,
        "scriptPath": str(MCP_HOME / "doma_mcp_stdio.py"),
        "installed": installed,
        "installedVersion": _installed_version(),
        "daemonRunning": health is not None and health.get("role") == "doma-bridge-daemon",
        "controlPortOccupied": port_occupied,
        "daemonVersion": health.get("version") if health else None,
        "bridgeProtocolVersion": health.get("bridgeProtocolVersion") if health else None,
        "bridgeConnected": health.get("bridgeConnected") is True if health else False,
        "agentCount": health.get("agentCount", 0) if health else 0,
    }


def _stop_daemon() -> None:
    current = status()
    if not current["daemonRunning"]:
        if current["controlPortOccupied"]:
            raise RuntimeError("control port is occupied by an unknown or inaccessible process")
        return
    try:
        result = _control("/v1/admin/stop", "POST", timeout=5)
    except Exception as error:
        raise RuntimeError(f"daemon stop failed: {error}") from error
    if not result or result.get("ok") is not True:
        raise RuntimeError("daemon is busy or too old for GUI stop; finish tasks and stop it manually")
    for _ in range(30):
        current = status()
        if not current["daemonRunning"] and not current["controlPortOccupied"]:
            return
        time.sleep(0.1)
    raise RuntimeError("daemon did not stop")


def _ensure_control_token() -> None:
    """Create the shared local token before probing a newly started daemon."""
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        try:
            with os.fdopen(descriptor, "w", encoding="ascii") as token_file:
                token_file.write(secrets.token_hex(32) + "\n")
        except BaseException:
            TOKEN_FILE.unlink(missing_ok=True)
            raise
    for attempt in range(20):
        if TOKEN_FILE.is_symlink() or not TOKEN_FILE.is_file():
            raise RuntimeError("local bridge token is not a regular file")
        token = TOKEN_FILE.read_text(encoding="ascii").strip()
        if _SHA_RE.fullmatch(token):
            return
        if token or attempt == 19:
            raise RuntimeError("local bridge token is invalid")
        time.sleep(0.05)


def _start_daemon() -> None:
    script = MCP_HOME / "doma_bridge_daemon.py"
    if not script.is_file():
        raise RuntimeError("MCP companion is not installed")
    _ensure_control_token()
    current = status()
    if current["daemonRunning"]:
        return
    if current["controlPortOccupied"]:
        raise RuntimeError("control port is occupied by an unknown or inaccessible process")
    log = open(MCP_HOME / "doma_bridge_daemon.log", "a", encoding="utf-8")
    try:
        options: dict[str, Any] = {
            "args": [sys.executable, str(script)],
            "stdin": subprocess.DEVNULL,
            "stdout": log,
            "stderr": subprocess.STDOUT,
            "close_fds": True,
        }
        if os.name == "nt":
            options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        else:
            options["start_new_session"] = True
        subprocess.Popen(**options)
    finally:
        log.close()
    for _ in range(40):
        if status()["daemonRunning"]:
            return
        time.sleep(0.1)
    raise RuntimeError("daemon did not start; inspect the local daemon log")


def _stage_verified(name: str, digest: str, source: str, destination: Path) -> None:
    if not isinstance(source, str):
        raise ValueError(f"invalid bundled file: {name}")
    content = source.encode("utf-8")
    if len(content) > MAX_FILE_BYTES:
        raise ValueError(f"bundled file is too large: {name}")
    if hashlib.sha256(content).hexdigest() != digest:
        raise ValueError(f"bundled file checksum mismatch: {name}")
    destination.write_bytes(content)


def upgrade(request: dict[str, Any]) -> dict[str, Any]:
    target = request.get("version")
    target_version = _version(target)
    current = _installed_version()
    if current and target_version < _version(current):
        raise ValueError("downgrade is not supported")
    hashes = request.get("sha256")
    if not isinstance(hashes, dict) or set(hashes) != set(MANAGED_FILES):
        raise ValueError("release file list does not match the MCP companion")
    if any(not isinstance(hashes[name], str) or not _SHA_RE.fullmatch(hashes[name]) for name in MANAGED_FILES):
        raise ValueError("invalid release checksum")
    files = request.get("files")
    if not isinstance(files, dict) or set(files) != set(MANAGED_FILES):
        raise ValueError("bundled file list does not match the MCP companion")

    MCP_HOME.mkdir(parents=True, exist_ok=True)
    for name in (*MANAGED_FILES, "release.json"):
        path = MCP_HOME / name
        if path.is_symlink():
            raise RuntimeError(f"refusing to replace symbolic link: {name}")
    with tempfile.TemporaryDirectory(prefix="doma-mcp-upgrade-", dir=MCP_HOME) as temporary:
        stage = Path(temporary)
        for name in MANAGED_FILES:
            _stage_verified(name, hashes[name], files[name], stage / name)
        # Syntax validation before stopping a working daemon.
        for name in MANAGED_FILES:
            import ast
            ast.parse((stage / name).read_text(encoding="utf-8"), filename=name)
        backups = stage / "previous"
        backups.mkdir()
        for name in (*MANAGED_FILES, "release.json"):
            path = MCP_HOME / name
            if path.exists():
                shutil.copy2(path, backups / name)

        was_running = status()["daemonRunning"]
        _stop_daemon()
        replaced: list[str] = []
        try:
            for name in MANAGED_FILES:
                os.replace(stage / name, MCP_HOME / name)
                replaced.append(name)
            metadata = stage / "release.json"
            metadata.write_text(json.dumps({"version": target, "sha256": hashes}, indent=2) + "\n", encoding="utf-8")
            os.replace(metadata, RELEASE_FILE)
            replaced.append("release.json")
            if was_running:
                _start_daemon()
                if status()["daemonVersion"] != target:
                    raise RuntimeError("updated daemon reported a different version")
        except Exception as upgrade_error:
            try:
                if status()["daemonRunning"]:
                    _stop_daemon()
                for name in reversed(replaced):
                    old = backups / name
                    if old.exists():
                        os.replace(old, MCP_HOME / name)
                    else:
                        (MCP_HOME / name).unlink(missing_ok=True)
                if was_running:
                    _start_daemon()
            except Exception as rollback_error:
                raise RuntimeError(
                    f"upgrade failed ({upgrade_error}); rollback needs repair: {rollback_error}"
                ) from rollback_error
            raise
    return {"ok": True, "installedVersion": target, "restartAgentRequired": True}


def uninstall() -> dict[str, Any]:
    if status()["agentCount"] > 0:
        raise RuntimeError("desktop agents are still connected; remove their MCP entry and restart them first")
    _stop_daemon()
    removed: list[str] = []
    for name in (*MANAGED_FILES, "release.json", "bridge-auth-token", "doma_bridge_daemon.log"):
        path = MCP_HOME / name
        if path.is_symlink():
            raise RuntimeError(f"refusing to remove symbolic link: {name}")
        if path.is_file():
            path.unlink()
            removed.append(name)
    return {"ok": True, "removed": removed, "managerStillInstalled": True, "agentConfigsRemain": True}


def dispatch(request: dict[str, Any]) -> dict[str, Any]:
    operation = request.get("operation")
    if operation == "status":
        return status()
    if operation == "upgrade":
        return upgrade(request)
    if operation == "start":
        _start_daemon()
        return status()
    if operation == "stop":
        _stop_daemon()
        return status()
    if operation == "uninstall":
        return uninstall()
    raise ValueError("unsupported manager operation")


def windows_launcher_bytes(python_path: Path, script_path: Path) -> bytes:
    return f'@echo off\r\n@chcp 65001 >nul\r\n"{python_path}" "{script_path}" %*\r\n'.encode("utf-8")


def unix_launcher_bytes(python_path: Path, script_path: Path) -> bytes:
    return f'#!/bin/sh\nexec "{python_path}" "{script_path}" "$@"\n'.encode("utf-8")


def register_host(extension_id: str) -> Path:
    """One-time bootstrap entry point; never exposed as a native message operation."""
    if not _EXTENSION_ID_RE.fullmatch(extension_id):
        raise ValueError("invalid Chrome/Edge extension ID")
    manager_dir = Path(__file__).resolve().parent
    script = Path(__file__).resolve()
    if os.name == "nt":
        launcher = manager_dir / "doma-mcp-manager.cmd"
        # Native Messaging uses binary framing; the launcher must not print text.
        launcher.write_bytes(windows_launcher_bytes(Path(sys.executable), script))
        host_path = launcher
    else:
        launcher = manager_dir / "doma-mcp-manager.sh"
        launcher.write_bytes(unix_launcher_bytes(Path(sys.executable), script))
        launcher.chmod(0o755)
        host_path = launcher

    manifest = manager_dir / f"{HOST_NAME}.json"
    origins: list[str] = []
    if manifest.exists():
        try:
            old = json.loads(manifest.read_text(encoding="utf-8"))
            origins = [
                origin for origin in old.get("allowed_origins", [])
                if isinstance(origin, str) and origin.startswith("chrome-extension://")
                and origin.endswith("/") and _EXTENSION_ID_RE.fullmatch(origin[19:-1])
            ]
        except (OSError, ValueError, AttributeError):
            pass
    origin = f"chrome-extension://{extension_id}/"
    if origin not in origins:
        origins.append(origin)
    manifest.write_text(
        json.dumps(
            {"name": HOST_NAME, "description": "DomA MCP companion manager", "path": str(host_path),
             "type": "stdio", "allowed_origins": origins},
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    if os.name == "nt":
        import winreg
        for vendor in (r"Software\Google\Chrome", r"Software\Microsoft\Edge"):
            key = vendor + "\\NativeMessagingHosts\\" + HOST_NAME
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as registry:
                winreg.SetValueEx(registry, "", 0, winreg.REG_SZ, str(manifest))
    elif sys.platform == "darwin":
        for browser in ("Google/Chrome", "Microsoft Edge"):
            directory = Path.home() / "Library" / "Application Support" / browser / "NativeMessagingHosts"
            directory.mkdir(parents=True, exist_ok=True)
            shutil.copy2(manifest, directory / manifest.name)
    else:
        for browser in ("google-chrome", "microsoft-edge"):
            directory = Path.home() / ".config" / browser / "NativeMessagingHosts"
            directory.mkdir(parents=True, exist_ok=True)
            shutil.copy2(manifest, directory / manifest.name)
    return manifest


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--register":
        print(register_host(sys.argv[2]))
        return
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    input_stream = sys.stdin.buffer
    output_stream = sys.stdout.buffer
    while True:
        header = input_stream.read(4)
        if not header:
            return
        if len(header) != 4:
            return
        size = struct.unpack("=I", header)[0]
        if size > MAX_MESSAGE_BYTES:
            return
        payload = input_stream.read(size)
        if len(payload) != size:
            return
        try:
            request = json.loads(payload.decode("utf-8"))
            if not isinstance(request, dict):
                raise ValueError("invalid request")
            result = dispatch(request)
        except Exception as error:
            result = {"ok": False, "error": str(error)}
        encoded = json.dumps(result, ensure_ascii=False).encode("utf-8")
        output_stream.write(struct.pack("=I", len(encoded)) + encoded)
        output_stream.flush()


if __name__ == "__main__":
    main()
