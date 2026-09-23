"""Focused lifecycle tests; all writes stay in a temporary directory."""

from __future__ import annotations

import hashlib
import http.client
import io
import json
import os
import subprocess
import struct
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import doma_mcp_manager as manager
import doma_bridge_daemon as daemon
import doma_mcp_stdio as stdio
import bridge_auth


HERE = Path(__file__).resolve().parent


class ManagerTests(unittest.TestCase):
    def test_stdio_json_is_utf8_safe_under_legacy_windows_encoding(self) -> None:
        wire = io.BytesIO()
        redirected_stdout = io.TextIOWrapper(wire, encoding="cp1252", write_through=True)
        with patch.object(stdio.sys, "stdout", redirected_stdout):
            stdio._send({"jsonrpc": "2.0", "id": 1, "result": {"text": "中文"}})
        payload = wire.getvalue()
        self.assertTrue(payload.isascii())
        self.assertEqual(json.loads(payload.decode("utf-8"))["result"]["text"], "中文")

    def test_daemon_stop_requires_auth_and_refuses_active_work(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            token_path = str(Path(temporary) / "token")
            old_port = daemon.CONTROL_PORT
            with patch.dict(os.environ, {"DOMA_BRIDGE_TOKEN_FILE": token_path}):
                token = bridge_auth.load_or_create_token()
                server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.ControlHTTPHandler)
                server.daemon_threads = True
                daemon.CONTROL_PORT = server.server_address[1]
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    def post(headers: dict[str, str]) -> int:
                        connection = http.client.HTTPConnection("127.0.0.1", daemon.CONTROL_PORT, timeout=2)
                        try:
                            connection.request("POST", "/v1/admin/stop", headers=headers)
                            response = connection.getresponse()
                            response.read()
                            return response.status
                        finally:
                            connection.close()

                    self.assertEqual(post({}), 401)
                    with daemon._TASKS_LOCK:
                        daemon._TASKS["manager-test"] = {
                            "status": "running", "requestId": "manager-test-request",
                        }
                        daemon._REQUESTS["manager-test-request"] = {
                            "status": "running", "conversationId": "manager-test",
                        }
                    self.assertEqual(post({"Authorization": f"Bearer {token}"}), 409)
                    daemon._update_task("manager-test", status="done", ok=True, text="finished")
                    with daemon._TASKS_LOCK:
                        self.assertEqual(daemon._REQUESTS["manager-test-request"]["status"], "done")
                    self.assertEqual(post({"Authorization": f"Bearer {token}"}), 200)
                    self.assertTrue(daemon._STOP_REQUESTED.is_set())
                finally:
                    daemon._STOP_REQUESTED.clear()
                    with daemon._TASKS_LOCK:
                        daemon._TASKS.pop("manager-test", None)
                        daemon._REQUESTS.pop("manager-test-request", None)
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=2)
                    daemon.CONTROL_PORT = old_port

    @unittest.skipUnless(os.name == "nt", "Windows launcher")
    def test_windows_launcher_starts_without_output_or_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            launcher = Path(temporary) / "manager.cmd"
            script = HERE / "doma_mcp_manager.py"
            content = manager.windows_launcher_bytes(Path(sys.executable), script)
            self.assertNotIn(b"\n", content.replace(b"\r\n", b""))
            launcher.write_bytes(content)
            request = json.dumps({"operation": "status"}).encode("utf-8")
            result = subprocess.run(
                ["cmd.exe", "/d", "/c", "call", str(launcher)],
                input=struct.pack("=I", len(request)) + request,
                capture_output=True,
                timeout=5,
            )
            self.assertEqual(result.returncode, 0)
            size = struct.unpack("=I", result.stdout[:4])[0]
            reply = json.loads(result.stdout[4:4 + size])
            self.assertEqual(len(result.stdout), size + 4)
            self.assertEqual(reply["managerVersion"], manager.MANAGER_VERSION)

    def test_bundled_release_hashes_match_sources(self) -> None:
        release = json.loads((HERE / "doma_mcp_release.json").read_text(encoding="utf-8"))
        self.assertEqual(set(release["sha256"]), set(manager.MANAGED_FILES))
        for name, expected in release["sha256"].items():
            self.assertEqual(hashlib.sha256((HERE / name).read_bytes()).hexdigest(), expected)
        self.assertEqual(
            hashlib.sha256((HERE / "doma_mcp_manager.py").read_bytes()).hexdigest(),
            release["managerSha256"],
        )

    def test_upgrade_rejects_bad_hash_before_stopping_daemon(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hashes = {name: "0" * 64 for name in manager.MANAGED_FILES}
            files = {name: "# bundled file\n" for name in manager.MANAGED_FILES}
            with patch.object(manager, "MCP_HOME", root), patch.object(manager, "RELEASE_FILE", root / "release.json"), \
                 patch.object(manager, "_stop_daemon") as stop:
                with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                    manager.upgrade({"version": "0.7.0", "sha256": hashes, "files": files})
                stop.assert_not_called()

    def test_upgrade_requires_exact_bundled_files_before_stopping_daemon(self) -> None:
        hashes = {name: "0" * 64 for name in manager.MANAGED_FILES}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(manager, "MCP_HOME", root), patch.object(manager, "RELEASE_FILE", root / "release.json"), \
                 patch.object(manager, "_stop_daemon") as stop:
                with self.assertRaisesRegex(ValueError, "bundled file list"):
                    manager.upgrade({"version": "0.7.0", "sha256": hashes, "files": {}})
                stop.assert_not_called()

    def test_upgrade_restores_previous_files_when_new_daemon_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous = {name: ("# old " + name + "\n").encode() for name in manager.MANAGED_FILES}
            newer = {name: ("# new " + name + "\n").encode() for name in manager.MANAGED_FILES}
            for name, data in previous.items():
                (root / name).write_bytes(data)
            old_release = '{"version":"0.6.2"}\n'
            (root / "release.json").write_text(old_release, encoding="utf-8")
            hashes = {name: hashlib.sha256(data).hexdigest() for name, data in newer.items()}

            running = {"daemonRunning": True, "controlPortOccupied": True, "agentCount": 0}
            stopped = {"daemonRunning": False, "controlPortOccupied": False, "agentCount": 0}
            with patch.object(manager, "MCP_HOME", root), patch.object(manager, "RELEASE_FILE", root / "release.json"), \
                 patch.object(manager, "status", side_effect=[running, stopped]), \
                 patch.object(manager, "_stop_daemon"), \
                 patch.object(manager, "_start_daemon", side_effect=[RuntimeError("start failed"), None]):
                with self.assertRaisesRegex(RuntimeError, "start failed"):
                    manager.upgrade({"version": "0.7.0", "sha256": hashes,
                                     "files": {name: data.decode() for name, data in newer.items()}})
            for name, data in previous.items():
                self.assertEqual((root / name).read_bytes(), data)
            self.assertEqual((root / "release.json").read_text(encoding="utf-8"), old_release)

    def test_stop_refuses_unknown_process_on_control_port(self) -> None:
        with patch.object(manager, "status", return_value={"daemonRunning": False, "controlPortOccupied": True}):
            with self.assertRaisesRegex(RuntimeError, "unknown or inaccessible process"):
                manager._stop_daemon()

    def test_stop_waits_until_control_port_is_released(self) -> None:
        states = [
            {"daemonRunning": True, "controlPortOccupied": True},
            {"daemonRunning": False, "controlPortOccupied": True},
            {"daemonRunning": False, "controlPortOccupied": False},
        ]
        with patch.object(manager, "status", side_effect=states) as status, \
             patch.object(manager, "_control", return_value={"ok": True}), \
             patch.object(manager.time, "sleep"):
            manager._stop_daemon()
            self.assertEqual(status.call_count, 3)

    def test_start_creates_token_before_detecting_existing_daemon(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "doma_bridge_daemon.py").write_text("# installed\n", encoding="utf-8")
            token_path = root / "bridge-auth-token"
            observed: list[bool] = []

            def running_status() -> dict[str, bool]:
                observed.append(token_path.is_file())
                return {"daemonRunning": True, "controlPortOccupied": True}

            with patch.object(manager, "MCP_HOME", root), patch.object(manager, "TOKEN_FILE", token_path), \
                 patch.object(manager, "status", side_effect=running_status), \
                 patch.object(manager.subprocess, "Popen") as popen:
                manager._start_daemon()
                popen.assert_not_called()
            self.assertEqual(observed, [True])
            token = token_path.read_text(encoding="ascii").strip()
            self.assertRegex(token, r"^[0-9a-f]{64}$")

            with patch.object(manager, "TOKEN_FILE", token_path):
                manager._ensure_control_token()
            self.assertEqual(token_path.read_text(encoding="ascii").strip(), token)

    def test_upgrade_and_uninstall_touch_only_owned_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "user-note.txt").write_text("keep", encoding="utf-8")
            content = {name: ("# " + name + "\n").encode() for name in manager.MANAGED_FILES}
            hashes = {name: hashlib.sha256(data).hexdigest() for name, data in content.items()}

            with patch.object(manager, "MCP_HOME", root), patch.object(manager, "RELEASE_FILE", root / "release.json"), \
                 patch.object(manager, "TOKEN_FILE", root / "bridge-auth-token"), \
                 patch.object(manager, "status", return_value={"daemonRunning": False, "controlPortOccupied": False, "agentCount": 0}), \
                 patch.object(manager, "_stop_daemon"):
                result = manager.upgrade({"version": "0.7.0", "sha256": hashes,
                                          "files": {name: data.decode() for name, data in content.items()}})
                self.assertTrue(result["ok"])
                self.assertEqual(manager._installed_version(), "0.7.0")
                (root / "bridge-auth-token").write_text("token", encoding="utf-8")
                removed = manager.uninstall()
                self.assertTrue(removed["ok"])
                self.assertEqual((root / "user-note.txt").read_text(encoding="utf-8"), "keep")
                self.assertFalse((root / "release.json").exists())
                self.assertFalse((root / "bridge-auth-token").exists())


if __name__ == "__main__":
    unittest.main()
