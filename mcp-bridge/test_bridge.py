"""Focused protocol and access-boundary checks for the local MCP bridge."""

from __future__ import annotations

import contextlib
import http.client
import io
import json
import os
import socket
import stat
import tempfile
import threading
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

    def test_http_rejects_non_ascii_authorization_with_401(self) -> None:
        for authorization in ("Bearer \u00e9", f"Bearer {self.token}\u00e9"):
            with self.subTest(authorization=authorization[-1]):
                status, _, body = self.request("GET", {"Authorization": authorization})
                self.assertEqual(status, 401)
                self.assertEqual(json.loads(body)["text"], "unauthorized")

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

    def test_shutdown_requires_auth_and_sets_stop_flag(self) -> None:
        daemon._STOP.clear()
        connection = http.client.HTTPConnection("127.0.0.1", daemon.CONTROL_PORT, timeout=2)
        try:
            connection.request(
                "POST",
                "/v1/shutdown",
                body=b"{}",
                headers={"Content-Type": "application/json", "Content-Length": "2"},
            )
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            response.read()
        finally:
            connection.close()
        self.assertFalse(daemon._STOP.is_set())

        connection = http.client.HTTPConnection("127.0.0.1", daemon.CONTROL_PORT, timeout=2)
        try:
            connection.request(
                "POST",
                "/v1/shutdown",
                body=b"{}",
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                    "Content-Length": "2",
                },
            )
            response = connection.getresponse()
            body = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertTrue(body["ok"])
        finally:
            connection.close()
        self.assertTrue(daemon._STOP.is_set())
        daemon._STOP.clear()


class BridgeProtocolTests(unittest.TestCase):
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

    def test_old_daemon_is_stopped_then_respawned(self) -> None:
        health_calls = {"n": 0}
        stop_calls = {"n": 0}
        spawn_calls = {"n": 0}

        def health() -> dict | None:
            health_calls["n"] += 1
            if health_calls["n"] == 1:
                return {"ok": True, "role": "doma-bridge-daemon"}  # outdated: no authRequired
            if health_calls["n"] == 2:
                return None  # after stop
            return {"ok": True, "role": "doma-bridge-daemon", "authRequired": True}

        original_health = stdio._health_status
        original_stop = stdio._stop_daemon
        original_spawn = stdio._spawn_daemon
        try:
            stdio._health_status = health
            stdio._stop_daemon = lambda: stop_calls.__setitem__("n", stop_calls["n"] + 1)
            stdio._spawn_daemon = lambda: spawn_calls.__setitem__("n", spawn_calls["n"] + 1)
            stdio.ensure_daemon()
            self.assertEqual(stop_calls["n"], 1)
            self.assertEqual(spawn_calls["n"], 1)
        finally:
            stdio._health_status = original_health
            stdio._stop_daemon = original_stop
            stdio._spawn_daemon = original_spawn

    def test_old_daemon_raises_if_stop_fails(self) -> None:
        original_health = stdio._health_status
        original_stop = stdio._stop_daemon
        try:
            stdio._health_status = lambda: {"ok": True, "role": "doma-bridge-daemon"}
            stdio._stop_daemon = lambda: None
            with self.assertRaisesRegex(RuntimeError, "could not be stopped"):
                stdio.ensure_daemon()
        finally:
            stdio._health_status = original_health
            stdio._stop_daemon = original_stop


if __name__ == "__main__":
    unittest.main()
