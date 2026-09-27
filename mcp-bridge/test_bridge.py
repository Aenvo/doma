"""Focused protocol and access-boundary checks for the local MCP bridge."""

from __future__ import annotations

import contextlib
import http.client
import io
import json
import os
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
from pathlib import Path

import bridge_auth
import doma_bridge_daemon as daemon
import doma_mcp_stdio as stdio


class BridgeAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="doma-mcp-test-")
        cls.old_token_file = os.environ.get("DOMA_BRIDGE_TOKEN_FILE")
        os.environ["DOMA_BRIDGE_TOKEN_FILE"] = str(Path(cls.temp.name) / "token")
        cls.token = bridge_auth.load_or_create_token()
        cls.old_control_port = daemon.CONTROL_PORT
        cls.server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.ControlHTTPHandler)
        cls.server.daemon_threads = True
        daemon.CONTROL_PORT = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        daemon.CONTROL_PORT = cls.old_control_port
        if cls.old_token_file is None:
            os.environ.pop("DOMA_BRIDGE_TOKEN_FILE", None)
        else:
            os.environ["DOMA_BRIDGE_TOKEN_FILE"] = cls.old_token_file
        cls.temp.cleanup()

    def request(self, method: str, headers: dict[str, str] | None = None):
        connection = http.client.HTTPConnection("127.0.0.1", daemon.CONTROL_PORT, timeout=2)
        try:
            connection.request(method, "/v1/health", headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_token_file_is_private_and_stable(self) -> None:
        self.assertEqual(self.token, bridge_auth.load_or_create_token())
        self.assertEqual(len(self.token), 64)
        if os.name != "nt":
            mode = stat.S_IMODE(Path(os.environ["DOMA_BRIDGE_TOKEN_FILE"]).stat().st_mode)
            self.assertEqual(mode & 0o077, 0)

    def test_http_requires_token_and_rejects_web_origins(self) -> None:
        status, headers, _ = self.request("GET")
        self.assertEqual(status, 401)
        self.assertNotIn("Access-Control-Allow-Origin", headers)

        auth = {"Authorization": f"Bearer {self.token}"}
        status, _, body = self.request("GET", auth)
        self.assertEqual(status, 200)
        self.assertIs(json.loads(body)["authRequired"], True)

        status, _, _ = self.request("GET", {**auth, "Origin": "https://example.com"})
        self.assertEqual(status, 403)
        status, _, _ = self.request("GET", {**auth, "Host": "example.com"})
        self.assertEqual(status, 403)
        status, _, _ = self.request("OPTIONS", auth)
        self.assertEqual(status, 403)

    def test_http_rejects_oversized_body_before_dispatch(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", daemon.CONTROL_PORT, timeout=2)
        try:
            connection.request(
                "POST",
                "/v1/conversations/start",
                body=b"",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Length": str(daemon.MAX_BRIDGE_MESSAGE_BYTES + 1),
                },
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 413)
            response.read()
        finally:
            connection.close()

    def test_stdio_control_request_ignores_process_http_proxy(self) -> None:
        proxy_env = {
            "HTTP_PROXY": "http://127.0.0.1:1",
            "http_proxy": "http://127.0.0.1:1",
            "NO_PROXY": "",
            "no_proxy": "",
        }
        with mock.patch.dict(os.environ, proxy_env):
            result = stdio._http_json(
                "GET", f"http://127.0.0.1:{daemon.CONTROL_PORT}/v1/health"
            )
        self.assertIs(result["authRequired"], True)

    def test_unicode_task_reaches_daemon_over_http(self) -> None:
        task = "读取中文页面与 emoji 🌐"
        with mock.patch.object(daemon, "dispatch_to_doma", return_value={"ok": False, "status": "error", "text": "test stop"}):
            response = stdio._http_json("POST", f"http://127.0.0.1:{daemon.CONTROL_PORT}/v1/conversations/start",
                                        {"task": task, "callerAgent": "Codex"})
        self.assertEqual(response["status"], "error")
        with daemon._TASKS_LOCK:
            self.assertTrue(any(task in str(req.get("sendText")) for req in daemon._REQUESTS.values()))


class BridgeProtocolTests(unittest.TestCase):
    def test_websocket_terminal_result_is_acknowledged_and_idempotent(self) -> None:
        server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.BridgeWSHandler)
        server.daemon_threads = True
        original_port = daemon.BRIDGE_PORT
        daemon.BRIDGE_PORT = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        cid, rid = "test-ws-result", "test-ws-turn"
        try:
            with socket.create_connection(server.server_address, timeout=2) as client:
                client.settimeout(2)
                client.sendall((
                    f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{daemon.BRIDGE_PORT}\r\n"
                    "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                    "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop\r\n\r\n"
                ).encode("ascii"))
                stream = client.makefile("rb")
                self.assertIn(b"101", stream.readline())
                while stream.readline() != b"\r\n":
                    pass

                def receive_frame():
                    header = stream.read(2)
                    length = header[1] & 127
                    if length == 126:
                        length = int.from_bytes(stream.read(2), "big")
                    elif length == 127:
                        length = int.from_bytes(stream.read(8), "big")
                    return json.loads(stream.read(length))

                def send_frame(payload):
                    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    mask = b"\x01\x02\x03\x04"
                    length = len(data)
                    header = b"\x81" + (bytes([0x80 | length]) if length < 126 else b"\xfe" + length.to_bytes(2, "big"))
                    client.sendall(header + mask + bytes(byte ^ mask[i % 4] for i, byte in enumerate(data)))

                self.assertEqual(receive_frame()["type"], "hello")
                with daemon._CLIENTS_LOCK:
                    handler = daemon._CLIENTS[-1]
                    daemon._CONVERSATION_CLIENTS[cid] = handler
                with daemon._TASKS_LOCK:
                    daemon._TASKS[cid] = {"conversationId": cid, "requestId": rid, "status": "running", "createdAt": time.time()}
                message = {"type": "result", "conversationId": cid, "requestId": rid, "resultId": rid,
                           "status": "done", "ok": True, "text": "中文完成"}
                send_frame(message)
                self.assertEqual(receive_frame(), {"type": "result_ack", "resultId": rid})
                send_frame({**message, "text": "duplicate"})
                self.assertEqual(receive_frame(), {"type": "result_ack", "resultId": rid})
                self.assertEqual(daemon.get_conversation_result(cid)["text"], "中文完成")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            daemon.BRIDGE_PORT = original_port

    def test_utf8_stdio_input_with_legacy_windows_console_encoding(self) -> None:
        script = (
            "import json, doma_mcp_stdio as s; "
            "s.ensure_daemon=lambda: None; s._heartbeat_once=lambda: None; "
            "s._heartbeat_loop=lambda: None; "
            "s.call_start=lambda a: json.dumps({'task': a['task']}, ensure_ascii=False); "
            "s.main()"
        )
        request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
            "name": "browser_start_group_conversation", "arguments": {"task": "查看中文网页摘要 🌐"}}}
        invalid = {**request, "id": 2, "params": {"name": "browser_start_group_conversation", "arguments": {"task": chr(0xDC80)}}}
        env = {**os.environ, "PYTHONUTF8": "0", "PYTHONIOENCODING": "cp1252:surrogateescape", "PYTHONDONTWRITEBYTECODE": "1"}
        run = subprocess.run(
            [sys.executable, "-c", script], input=(json.dumps(request, ensure_ascii=False) + "\n" + json.dumps(invalid) + "\n").encode("utf-8"),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=Path(__file__).parent, timeout=5,
        )
        self.assertEqual(run.returncode, 0, run.stderr.decode("utf-8", "replace"))
        responses = [json.loads(line) for line in run.stdout.splitlines()]
        result = responses[0]["result"]["content"][0]["text"]
        self.assertEqual(json.loads(result)["task"], "查看中文网页摘要 🌐")
        self.assertEqual(responses[1]["error"]["code"], -32602)

    def test_followup_terminal_status_and_duplicate_result_are_idempotent(self) -> None:
        cid = "test-conversation-protocol"
        with daemon._TASKS_LOCK:
            daemon._TASKS.clear()
            daemon._REQUESTS.clear()
            daemon._REQUEST_TO_CONVERSATION.clear()
        def fake_dispatch(request_id, _send_text, _attachments, _caller, **_kwargs):
            daemon._bind_conversation(request_id, cid)
            return {"ok": True, "status": "pending"}
        with mock.patch.object(daemon, "dispatch_to_doma", side_effect=fake_dispatch):
            started = daemon.start_group_conversation("中文任务", caller_agent="Codex")
            self.assertEqual(started["status"], "running")
            first_request = started["requestId"]
            busy = daemon.send_conversation_message(cid, "过早跟进", caller_agent="Codex")
            self.assertEqual(busy["status"], "running")
            self.assertEqual(busy["requestId"], first_request)
            self.assertTrue(daemon._apply_extension_result({"conversationId": cid, "requestId": first_request, "status": "needs_user_input", "ok": True, "text": "请选择 A 还是 B？"}))
            self.assertEqual(daemon.get_conversation_result(cid)["status"], "needs_user_input")
            sent = daemon.send_conversation_message(cid, "选 A", caller_agent="Codex")
            self.assertEqual(sent["status"], "running")
            second_request = sent["requestId"]
            self.assertNotEqual(first_request, second_request)
            daemon._apply_extension_result({"conversationId": cid, "requestId": first_request, "status": "error", "text": "stale"})
            self.assertEqual(daemon.get_conversation_result(cid)["status"], "running")
            final = {"conversationId": cid, "requestId": second_request, "status": "done", "ok": True,
                     "text": "完成。", "sources": ["https://example.com/"], "artifacts": [{"type": "FILE_CARD", "title": "a.pdf", "url": "https://example.com/a.pdf"}]}
            daemon._apply_extension_result(final)
            daemon._apply_extension_result({**final, "status": "error", "text": "duplicate"})
            result = daemon.get_conversation_result(cid)
            self.assertEqual(result["status"], "done")
            self.assertEqual(result["text"], "完成。")
            self.assertEqual(result["sources"], ["https://example.com/"])
            self.assertEqual(result["artifacts"][0]["title"], "a.pdf")

    def test_running_result_expires_with_explicit_error(self) -> None:
        cid = "test-expired-conversation"
        with daemon._TASKS_LOCK:
            daemon._TASKS[cid] = {"status": "running", "updatedAt": 1, "createdAt": 1, "text": "running"}
        result = daemon.get_conversation_result(cid)
        self.assertEqual(result["status"], "error")
        self.assertIn("超时", result["text"])

    def test_empty_done_and_cancel_are_errors(self) -> None:
        for cid, incoming in (
            ("test-empty", {"status": "done", "ok": True, "text": ""}),
            ("test-cancel", {"status": "error", "ok": False, "text": "任务已停止"}),
        ):
            with daemon._TASKS_LOCK:
                daemon._TASKS[cid] = {"conversationId": cid, "requestId": cid, "status": "running", "createdAt": time.time()}
            daemon._apply_extension_result({"conversationId": cid, "requestId": cid, **incoming})
            result = daemon.get_conversation_result(cid)
            self.assertEqual(result["status"], "error")
            self.assertFalse(result["ok"])
            self.assertTrue(result["text"])

    def test_websocket_handshake_rejects_pages_and_accepts_extension(self) -> None:
        server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.BridgeWSHandler)
        server.daemon_threads = True
        original_port = daemon.BRIDGE_PORT
        daemon.BRIDGE_PORT = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for origin, expected in (
                ("https://example.com", b"403"),
                ("chrome-extension://abcdefghijklmnopabcdefghijklmnop", b"101"),
            ):
                with socket.create_connection(server.server_address, timeout=2) as client:
                    client.settimeout(2)
                    request = (
                        "GET / HTTP/1.1\r\n"
                        f"Host: 127.0.0.1:{daemon.BRIDGE_PORT}\r\n"
                        "Upgrade: websocket\r\n"
                        "Connection: Upgrade\r\n"
                        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                        f"Origin: {origin}\r\n\r\n"
                    )
                    client.sendall(request.encode("ascii"))
                    self.assertIn(expected, client.recv(512).split(b"\r\n", 1)[0])
                    if expected == b"101":
                        client.sendall(b"\x88\x80\x00\x00\x00\x00")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            daemon.BRIDGE_PORT = original_port

    def test_tool_failures_set_mcp_is_error(self) -> None:
        original = stdio.call_get
        try:
            for status, expected_error in (("running", False), ("error", True)):
                stdio.call_get = lambda _args, status=status: json.dumps(
                    {"ok": False, "status": status, "text": "example"}
                )
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    stdio.handle_request(
                        {
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "tools/call",
                            "params": {
                                "name": "browser_get_conversation_result",
                                "arguments": {"conversationId": "sample"},
                            },
                        }
                    )
                response = json.loads(output.getvalue())
                self.assertIs(response["result"]["isError"], expected_error)
        finally:
            stdio.call_get = original

    def test_old_daemon_is_rejected_before_a_new_spawn(self) -> None:
        original = stdio._health_status
        try:
            stdio._health_status = lambda: {"ok": True, "role": "doma-bridge-daemon"}
            with self.assertRaisesRegex(RuntimeError, "outdated"):
                stdio.ensure_daemon()
        finally:
            stdio._health_status = original


if __name__ == "__main__":
    unittest.main()
