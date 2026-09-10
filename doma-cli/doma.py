#!/usr/bin/env python3
"""
DomA CLI — conversation commands only.

Service lifecycle (helper :3848 + CLI bridge :3856/:3857) is owned by
`doma-cli-runner start|stop|status`. This command only talks to the bridge HTTP API.

Commands:
  doma help
  doma conv start -m "..."
  doma conv send <conversationId> -m "..."
  doma conv result <conversationId> [--watch]
  doma conv close <conversationId>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

CLI_VERSION = "0.0.1"
CONTROL_PORT = int(os.environ.get("DOMA_CLI_CONTROL_PORT", "3856"))
CONTROL_BASE = f"http://127.0.0.1:{CONTROL_PORT}"
RUNNER_HOST = os.environ.get("DOMA_CLI_RUNNER_HOST", "127.0.0.1")
RUNNER_PORT = int(os.environ.get("DOMA_CLI_RUNNER_PORT", "3848"))
RUNNER_BASE = f"http://{RUNNER_HOST}:{RUNNER_PORT}"
BIND_HTTP_TIMEOUT = float(os.environ.get("DOMA_BIND_TIMEOUT_SEC", "90")) + 15.0
CLIENT_ID = os.environ.get("DOMA_CLI_CLIENT_ID") or str(uuid.uuid4())
AGENT_NAME = (os.environ.get("DOMA_CALLER_AGENT") or "CLI").strip()[:64] or "CLI"

START_HINT = "Please start DomA first:\n  doma-cli-runner start -d"

HELP_TEXT = f"""DomA CLI {CLI_VERSION}

USAGE
  doma-cli-runner start -d
  doma conv start -m <message> [--agent <name>]
  doma conv send <conversationId> -m <message> [--agent <name>]
  doma conv result <conversationId> [--watch] [--interval <sec>]
  doma conv close <conversationId> [--agent <name>]
  doma-cli-runner stop

COMMANDS
  help
      Show this help.

  conv start
      Start a browser conversation.
      Required: -m / --message

  conv send
      Send a follow-up message.
      Args: <conversationId> -m <message>

  conv result
      Get conversation status/result.
      Optional: --watch, --interval SEC (default 2)

  conv close
      Close a conversation.

EXAMPLES
  doma-cli-runner start -d
  doma conv start -m "Open baidu.com, search DomA, return first-page titles"
  doma conv send <conversationId> -m "Click the first result"
  doma conv result <conversationId> --watch
  doma conv close <conversationId>
  doma-cli-runner stop
"""


def _http_json(method: str, url: str, body: Any = None, timeout: float = 120.0) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        if not isinstance(parsed, dict):
            return {"ok": False, "text": "invalid bridge response", "status": "error"}
        return parsed


def _runner_ok() -> bool:
    try:
        req = urllib.request.Request(
            f"{RUNNER_BASE}/v1/health",
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def _bridge_ok() -> bool:
    try:
        out = _http_json("GET", f"{CONTROL_BASE}/v1/health", timeout=1.5)
        return bool(out.get("ok"))
    except Exception:
        return False


def ensure_service() -> Optional[str]:
    """Return an error message if cli-runner service is not up; else None."""
    if _runner_ok() and _bridge_ok():
        return None
    return f"DomA is not running.\n{START_HINT}"


def _fail_service(msg: str) -> int:
    print(
        json.dumps(
            {"ok": False, "status": "error", "text": msg},
            ensure_ascii=False,
            indent=2,
        ),
        file=sys.stderr,
    )
    print(msg, file=sys.stderr)
    return 1


def _heartbeat(agent: str) -> None:
    try:
        _http_json(
            "POST",
            f"{CONTROL_BASE}/v1/agents/heartbeat",
            {"clientId": CLIENT_ID, "name": agent, "callerAgent": agent},
            timeout=2.0,
        )
    except Exception:
        pass


def _print_json(obj: dict[str, Any]) -> int:
    print(json.dumps(obj, ensure_ascii=False, indent=2))
    if obj.get("ok") is False or obj.get("status") == "error":
        return 1
    return 0


def _resolve_agent(cli_agent: Optional[str]) -> str:
    if isinstance(cli_agent, str) and cli_agent.strip():
        return cli_agent.strip()[:64]
    return AGENT_NAME


def cmd_conv_start(message: str, agent: Optional[str]) -> int:
    err = ensure_service()
    if err:
        return _fail_service(err)
    name = _resolve_agent(agent)
    _heartbeat(name)
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/start",
        {
            "task": message,
            "callerAgent": name,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return _print_json(out)


def cmd_conv_send(conversation_id: str, message: str, agent: Optional[str]) -> int:
    err = ensure_service()
    if err:
        return _fail_service(err)
    name = _resolve_agent(agent)
    _heartbeat(name)
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/message",
        {
            "conversationId": conversation_id,
            "text": message,
            "callerAgent": name,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return _print_json(out)


def cmd_conv_result(conversation_id: str, watch: bool, interval: float) -> int:
    err = ensure_service()
    if err:
        return _fail_service(err)
    _heartbeat(AGENT_NAME)
    cid = conversation_id.strip()
    url = f"{CONTROL_BASE}/v1/conversations/{urllib.parse.quote(cid, safe='')}"

    def once() -> dict[str, Any]:
        return _http_json("GET", url, timeout=30.0)

    if not watch:
        return _print_json(once())

    while True:
        out = once()
        status = str(out.get("status") or "")
        print(json.dumps(out, ensure_ascii=False, indent=2), flush=True)
        if status in ("done", "error"):
            return 0 if out.get("ok") is not False and status != "error" else 1
        time.sleep(max(0.2, interval))


def cmd_conv_close(conversation_id: str, agent: Optional[str]) -> int:
    err = ensure_service()
    if err:
        return _fail_service(err)
    name = _resolve_agent(agent)
    _heartbeat(name)
    out = _http_json(
        "POST",
        f"{CONTROL_BASE}/v1/conversations/close",
        {
            "conversationId": conversation_id,
            "callerAgent": name,
            "clientId": CLIENT_ID,
        },
        timeout=BIND_HTTP_TIMEOUT,
    )
    return _print_json(out)


def build_conv_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="doma conv", add_help=True)
    sub = p.add_subparsers(dest="conv_cmd", required=True)

    start = sub.add_parser("start", help="Start a group browser conversation")
    start.add_argument("-m", "--message", required=True, help="Natural-language task")
    start.add_argument("--agent", default=None, help="Caller agent name (default CLI)")

    send = sub.add_parser("send", help="Send a follow-up message")
    send.add_argument("conversationId", help="Conversation id from start")
    send.add_argument("-m", "--message", required=True, help="Follow-up message")
    send.add_argument("--agent", default=None, help="Caller agent name")

    result = sub.add_parser("result", help="Get conversation status/result")
    result.add_argument("conversationId", help="Conversation id")
    result.add_argument("--watch", action="store_true", help="Poll until done/error")
    result.add_argument("--interval", type=float, default=2.0, help="Watch interval sec")

    close = sub.add_parser("close", help="Close a conversation")
    close.add_argument("conversationId", help="Conversation id")
    close.add_argument("--agent", default=None, help="Caller agent name")

    return p


def main(argv: Optional[list[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    if not argv or argv[0] in ("help", "-h", "--help"):
        print(HELP_TEXT, end="")
        return 0

    if argv[0] in ("start", "stop", "status"):
        print(
            f"[doma] use: doma-cli-runner {argv[0]}"
            + (" -d" if argv[0] == "start" else ""),
            file=sys.stderr,
        )
        return 1

    if argv[0] == "conv":
        conv_parser = build_conv_parser()
        try:
            args = conv_parser.parse_args(argv[1:])
        except SystemExit as e:
            return int(e.code) if isinstance(e.code, int) else 1
        try:
            if args.conv_cmd == "start":
                return cmd_conv_start(args.message, args.agent)
            if args.conv_cmd == "send":
                return cmd_conv_send(args.conversationId, args.message, args.agent)
            if args.conv_cmd == "result":
                return cmd_conv_result(args.conversationId, args.watch, args.interval)
            if args.conv_cmd == "close":
                return cmd_conv_close(args.conversationId, args.agent)
        except urllib.error.URLError:
            return _fail_service(f"DomA is not running.\n{START_HINT}")
        except Exception as e:
            return _fail_service(str(e))
        return 1

    print(f"Unknown command: {argv[0]}\n", file=sys.stderr)
    print(HELP_TEXT, end="")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
