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

    def test_unicode_task_reaches_daemon_over_http(self) -> None:
        task = "读取中文页面与 emoji 🌐"
        with mock.patch.object(daemon, "dispatch_to_doma", return_value={"ok": False, "status": "error", "text": "test stop"}):
            response = stdio._http_json("POST", f"http://127.0.0.1:{daemon.CONTROL_PORT}/v1/conversations/start",
                                        {"task": task, "callerAgent": "Codex"})
        self.assertEqual(response["status"], "error")
        with daemon._TASKS_LOCK:
            self.assertTrue(any(task in str(req.get("sendText")) for req in daemon._REQUESTS.values()))


class BridgeConversationRecoveryTests(unittest.TestCase):
    """Exercise routing in memory, without a daemon, socket, or browser."""

    class Client:
        def __init__(self, fail_send: bool = False):
            self.messages = []
            self.fail_send = fail_send

        def send_text(self, raw: str) -> None:
            if self.fail_send:
                raise OSError("fixture disconnected")
            payload = json.loads(raw)
            self.messages.append(payload)
            if payload["type"] == "message":
                daemon._bind_conversation(payload["requestId"], payload["conversationId"])

    def setUp(self) -> None:
        for name, value in (
            ("_CLIENTS", []), ("_CLIENT_META", {}), ("_REQUEST_CLIENTS", {}),
            ("_CONVERSATION_CLIENTS", {}), ("_CONVERSATION_TAB_IDS", {}),
            ("_TASKS", {}), ("_REQUESTS", {}), ("_REQUEST_TO_CONVERSATION", {}),
        ):
            patcher = mock.patch.object(daemon, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def saved(self, cid: str, owner, tab_id: int | None = None) -> None:
        daemon._CONVERSATION_CLIENTS[cid] = owner
        if tab_id is not None:
            daemon._CONVERSATION_TAB_IDS[cid] = tab_id
        daemon._TASKS[cid] = {"conversationId": cid, "requestId": "previous-turn",
                              "status": "done", "ok": True, "text": "previous final",
                              "targetTitle": "Previous page", "targetUrl": "https://example.com/previous"}

    def hello(self, client, tab_id: int | None, cid: str | None = None) -> None:
        daemon._CLIENTS.append(client)
        data = {"tabId": tab_id, "title": "Current page", "url": "https://example.com/current"}
        if cid is not None:
            data["activeConversationId"] = cid
        daemon._register_client_hello(client, data)

    def test_same_tab_reconnect_remains_compatible_without_explicit_cid(self) -> None:
        self.saved("same-tab", self.Client(), 7)
        current = self.Client()
        self.hello(current, 7)
        self.assertIs(daemon._conversation_client("same-tab"), current)
        self.assertEqual(daemon.get_conversation_result("same-tab")["text"], "previous final")
        self.assertEqual(current.messages, [])

    def test_explicit_cid_restores_offline_owner_on_new_tab_or_without_saved_tab(self) -> None:
        for old_tab_id in (7, None):
            with self.subTest(old_tab_id=old_tab_id):
                cid = f"offline-{old_tab_id}"
                self.saved(cid, self.Client(), old_tab_id)
                current = self.Client()
                self.hello(current, 8, cid)
                result = daemon.get_conversation_result(cid)
                self.assertIs(daemon._conversation_client(cid), current)
                self.assertEqual(result["expectedTabId"], 8)
                self.assertEqual(result["targetTitle"], "Previous page")
                self.assertEqual(result["targetUrl"], "https://example.com/previous")
                self.assertEqual(result["status"], "done")
                self.assertEqual(result["text"], "previous final")
                self.assertEqual(current.messages, [])

    def test_hello_preserves_previous_result_source_and_next_turn_uses_current_page(self) -> None:
        self.saved("source", self.Client(), 7)
        current = self.Client()
        self.hello(current, 8, "source")
        previous = daemon.get_conversation_result("source")
        self.assertEqual(previous["targetUrl"], "https://example.com/previous")
        self.assertEqual(previous["text"], "previous final")
        sent = daemon.send_conversation_message("source", "Read current title")
        result = daemon.get_conversation_result("source")
        self.assertEqual(result["targetTitle"], "Current page")
        self.assertEqual(result["targetUrl"], "https://example.com/current")
        self.assertEqual(result["requestId"], sent["requestId"])

    def test_hello_cannot_take_another_live_owner(self) -> None:
        for new_tab_id in (7, 8):
            with self.subTest(new_tab_id=new_tab_id):
                cid = f"live-{new_tab_id}"
                owner = self.Client()
                self.hello(owner, 7)
                self.saved(cid, owner, 7)
                challenger = self.Client()
                self.hello(challenger, new_tab_id, cid)
                self.assertIs(daemon._conversation_client(cid), owner)
                self.assertEqual(daemon._CONVERSATION_TAB_IDS[cid], 7)
                self.assertEqual(daemon._TASKS[cid]["text"], "previous final")

    def test_connected_panel_does_not_guess_unrelated_or_unidentified_conversation(self) -> None:
        for panel_tab_id in (None, 8):
            with self.subTest(panel_tab_id=panel_tab_id):
                self.saved("no-tab", self.Client())
                self.saved("other-tab", self.Client(), 7)
                current = self.Client()
                self.hello(current, panel_tab_id)
                self.assertIsNone(daemon._conversation_client("no-tab"))
                self.assertIsNone(daemon._conversation_client("other-tab"))
                self.assertEqual(current.messages, [])

    def test_reconnect_claim_is_reconsidered_after_previous_owner_disconnects(self) -> None:
        owner = self.Client()
        self.hello(owner, 7)
        self.saved("overlap", owner, 7)
        current = self.Client()
        self.hello(current, 8, "overlap")
        self.assertIs(daemon._conversation_client("overlap"), owner)
        self.assertEqual(daemon._CONVERSATION_TAB_IDS["overlap"], 7)
        daemon._CLIENTS.remove(owner)
        daemon._CLIENT_META.pop(owner)
        result = daemon.get_conversation_result("overlap")
        self.assertIs(daemon._conversation_client("overlap"), current)
        self.assertTrue(result["conversationConnected"])
        self.assertEqual(result["expectedTabId"], 8)
        self.assertEqual(result["text"], "previous final")
        self.assertEqual(current.messages, [])

    def test_unknown_cid_is_recovered_only_by_explicit_identified_panel_and_can_continue(self) -> None:
        current = self.Client()
        self.hello(current, 8)
        self.assertEqual(daemon.get_conversation_result("restored")["status"], "error")
        daemon._register_client_hello(current, {"tabId": 8, "activeConversationId": "restored",
                                               "title": "Restored page", "url": "https://example.com/"})
        result = daemon.get_conversation_result("restored")
        self.assertEqual(result["status"], "needs_user_input")
        self.assertFalse(result["ok"])
        self.assertIsNone(result["requestId"])
        self.assertTrue(result["conversationConnected"])
        self.assertIn("上一回合结果未恢复", result["text"])
        self.assertEqual(result["sources"], [])
        self.assertEqual(result["artifacts"], [])
        self.assertEqual(current.messages, [])
        sent = daemon.send_conversation_message("restored", "Read current title", caller_agent="Codex")
        self.assertEqual(sent["status"], "running")
        self.assertTrue(sent["conversationConnected"])
        self.assertEqual(len(current.messages), 1)
        self.assertEqual(current.messages[0]["conversationId"], "restored")
        self.assertEqual(current.messages[0]["type"], "message")
        self.assertEqual(current.messages[0]["requestId"], sent["requestId"])

    def test_withdrawn_reconnect_claim_does_not_route_after_owner_leaves(self) -> None:
        owner = self.Client()
        self.hello(owner, 7)
        self.saved("withdrawn", owner, 7)
        current = self.Client()
        self.hello(current, 8, "withdrawn")
        daemon._register_client_hello(current, {"tabId": 8})
        daemon._CLIENTS.remove(owner)
        daemon._CLIENT_META.pop(owner)
        self.assertFalse(daemon.get_conversation_result("withdrawn")["conversationConnected"])
        self.assertEqual(current.messages, [])

    def test_explicit_cid_without_valid_host_tab_does_not_create_record(self) -> None:
        for tab_id in (None, True, 0, "8"):
            with self.subTest(tab_id=tab_id):
                current = self.Client()
                self.hello(current, tab_id, "unidentified")
                self.assertNotIn("unidentified", daemon._TASKS)
                self.assertNotIn("unidentified", daemon._CONVERSATION_CLIENTS)

    def test_send_close_and_get_distinguish_global_bridge_from_conversation_route(self) -> None:
        self.saved("old", self.Client(), 7)
        self.hello(self.Client(), 8)
        for action in (
            lambda: daemon.get_conversation_result("old"),
            lambda: daemon.send_conversation_message("old", "Read current title"),
            lambda: daemon.close_conversation("old"),
        ):
            result = action()
            self.assertTrue(result["bridgeConnected"])
            self.assertFalse(result["conversationConnected"])
            self.assertEqual(result["expectedTabId"], 7)
            self.assertEqual(result["connectedTabIds"], [8])

    def test_send_failure_keeps_global_connection_when_another_panel_is_connected(self) -> None:
        owner = self.Client(fail_send=True)
        self.hello(owner, 7)
        self.saved("fails-send", owner, 7)
        self.hello(self.Client(), 8)
        with contextlib.redirect_stderr(io.StringIO()):
            result = daemon.send_conversation_message("fails-send", "Read current title")
        self.assertEqual(result["status"], "error")
        self.assertTrue(result["bridgeConnected"])
        self.assertFalse(result["conversationConnected"])
        self.assertEqual(result["expectedTabId"], 7)
        self.assertEqual(result["connectedTabIds"], [8])
        self.assertTrue(result["requestId"])

    def test_no_connected_panel_reports_both_connections_false(self) -> None:
        self.saved("offline", self.Client(), 7)
        result = daemon.send_conversation_message("offline", "Read current title")
        self.assertFalse(result["bridgeConnected"])
        self.assertFalse(result["conversationConnected"])
        self.assertEqual(result["expectedTabId"], 7)
        self.assertEqual(result["connectedTabIds"], [])


class BridgeTurnIdentityTests(unittest.TestCase):
    """Inject turn hand-offs using real handlers and isolated in-memory state."""

    def setUp(self) -> None:
        for name, value in (
            ("_CLIENTS", []), ("_CLIENT_META", {}), ("_REQUEST_CLIENTS", {}),
            ("_CONVERSATION_CLIENTS", {}), ("_CONVERSATION_TAB_IDS", {}),
            ("_TASKS", {}), ("_REQUESTS", {}), ("_REQUEST_TO_CONVERSATION", {}),
        ):
            patcher = mock.patch.object(daemon, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def seed_running(self, cid: str, rid: str | None) -> None:
        now = time.time()
        if rid is not None:
            daemon._REQUESTS[rid] = {"requestId": rid, "conversationId": cid,
                                     "status": "running", "createdAt": now,
                                     "event": threading.Event()}
            daemon._REQUEST_TO_CONVERSATION[rid] = cid
        daemon._TASKS[cid] = {"conversationId": cid, "requestId": rid,
                             "status": "running", "createdAt": now, "text": "current"}

    def accept_message(self, request_id, _send_text, _attachments, _caller, **kwargs):
        daemon._bind_conversation(request_id, kwargs["conversation_id"])
        return {"ok": True}

    def test_result_identity_is_checked_when_update_commits(self) -> None:
        cases = [(status, identity) for status in ("done", "error", "needs_user_input", "running", "pending")
                 for identity in ("explicit", "legacy", "unbound")]
        for status, identity in cases:
            with self.subTest(status=status, identity=identity):
                cid = f"race-{status}-{identity}"
                old_rid = None if identity == "unbound" else f"old-{status}-{identity}"
                self.seed_running(cid, old_rid)
                update_reached, resume_update = threading.Event(), threading.Event()
                original_update = daemon._update_task
                accepted, failures = [], []

                def delayed_update(*args, **kwargs):
                    update_reached.set()
                    if not resume_update.wait(2):
                        raise AssertionError("fixture did not resume the old result")
                    return original_update(*args, **kwargs)

                def old_result():
                    try:
                        accepted.append(daemon._apply_extension_result({
                            "conversationId": cid,
                            **({"requestId": old_rid} if identity == "explicit" else {}),
                            "status": status, "ok": True, "text": "OLD TURN OUTPUT",
                            "sources": ["https://old.test/"],
                        }))
                    except Exception as error:
                        failures.append(error)

                with mock.patch.object(daemon, "_update_task", side_effect=delayed_update), \
                     mock.patch.object(daemon, "dispatch_to_doma", side_effect=self.accept_message):
                    thread = threading.Thread(target=old_result, daemon=True)
                    thread.start()
                    try:
                        self.assertTrue(update_reached.wait(2))
                        with daemon._TASKS_LOCK:
                            daemon._TASKS[cid]["createdAt"] = 1
                            if old_rid is not None:
                                daemon._REQUESTS[old_rid]["createdAt"] = 1
                            daemon._expire_tasks_locked(time.time())
                        followup = daemon.send_conversation_message(cid, "NEW TURN")
                        self.assertEqual(followup["status"], "running")
                        new_rid = followup["requestId"]
                    finally:
                        resume_update.set()
                        thread.join(timeout=2)
                    self.assertFalse(thread.is_alive())
                    self.assertEqual(failures, [])
                    self.assertEqual(accepted, [True], "stale deliveries still need an ACK")
                    result = daemon.get_conversation_result(cid)
                    self.assertEqual(result["requestId"], new_rid)
                    self.assertEqual(result["status"], "running")
                    self.assertNotEqual(result["text"], "OLD TURN OUTPUT")
                    self.assertEqual(result["sources"], [])
                    self.assertEqual(daemon._REQUESTS[new_rid]["status"], "running")
                    if old_rid is not None:
                        self.assertEqual(daemon._REQUESTS[old_rid]["status"], "error")

    def test_legacy_results_keep_working_for_the_same_task_identity(self) -> None:
        for rid in ("legacy-current", None):
            for status in ("done", "error", "needs_user_input", "running", "pending"):
                with self.subTest(request_id=rid, status=status):
                    cid = "legacy-same-identity"
                    self.seed_running(cid, rid)
                    self.assertTrue(daemon._apply_extension_result({
                        "conversationId": cid, "status": status,
                        "ok": True, "text": "same task output",
                    }))
                    result = daemon.get_conversation_result(cid)
                    self.assertEqual(result["requestId"], rid)
                    self.assertEqual(result["status"], status)
                    self.assertEqual(result["text"], "same task output")
                    if rid is not None and status in ("done", "error", "needs_user_input"):
                        self.assertEqual(daemon._REQUESTS[rid]["status"], status)

    def test_close_accepted_without_terminal_result_times_out(self) -> None:
        cid = "accepted-only"

        def accepted_only(request_id, conversation_id, _caller):
            daemon._bind_conversation(request_id, conversation_id)
            return {"ok": True}

        with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=accepted_only), \
             mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 0.01):
            result = daemon.close_conversation(cid)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "error")
        self.assertIn("超时", result["text"])
        self.assertEqual(daemon._REQUESTS[result["requestId"]]["status"], "error")
        self.assertEqual(daemon._TASKS[cid]["status"], "error")

    def test_close_returns_the_actual_terminal_success_or_failure(self) -> None:
        for status, ok, text in (("done", True, "fixture really closed"),
                                 ("error", False, "fixture close failed")):
            with self.subTest(status=status):
                cid = "close-terminal-" + status

                def finished(request_id, conversation_id, _caller):
                    daemon._bind_conversation(request_id, conversation_id)
                    daemon._apply_extension_result({
                        "conversationId": conversation_id, "requestId": request_id,
                        "status": status, "ok": ok, "text": text,
                    })
                    return {"ok": True}

                with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=finished), \
                     mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 0.01):
                    result = daemon.close_conversation(cid)
                self.assertEqual(result["status"], status)
                self.assertEqual(result["ok"], ok)
                self.assertEqual(result["text"], text)
                request = daemon._REQUESTS[result["requestId"]]
                self.assertTrue(request["event"].is_set())
                self.assertEqual(request["status"], status)

    def test_close_terminal_result_wins_if_it_commits_after_wait_times_out(self) -> None:
        for status, ok, text in (("done", True, "close completed at deadline"),
                                 ("error", False, "close failed at deadline"),
                                 ("needs_user_input", True, "close requires confirmation")):
            with self.subTest(status=status):
                cid = "close-deadline-" + status

                class DeadlineEvent(threading.Event):
                    def wait(self, timeout=None):
                        # Event.wait has decided to time out, but the result
                        # commits before the caller processes its False return.
                        request_id = daemon._TASKS[cid]["requestId"]
                        daemon._apply_extension_result({
                            "conversationId": cid, "requestId": request_id,
                            "status": status, "ok": ok, "text": text,
                        })
                        return False

                def accepted_only(request_id, conversation_id, _caller):
                    daemon._bind_conversation(request_id, conversation_id)
                    return {"ok": True}

                with mock.patch.object(daemon.threading, "Event", DeadlineEvent), \
                     mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=accepted_only):
                    result = daemon.close_conversation(cid)
                self.assertEqual(result["status"], status)
                self.assertEqual(result["ok"], status == "done" and ok)
                self.assertEqual(result["text"], text)
                self.assertEqual(daemon._REQUESTS[result["requestId"]]["status"], status)
                self.assertEqual(daemon._TASKS[cid]["status"], status)

    def test_close_waits_after_accepted_until_the_terminal_result(self) -> None:
        cid = "close-delayed"
        accepted, completed = threading.Event(), threading.Event()
        returned, request_ids = [], []

        def pending_close(request_id, conversation_id, _caller):
            request_ids.append(request_id)
            daemon._bind_conversation(request_id, conversation_id)
            accepted.set()
            return {"ok": True}

        def close():
            returned.append(daemon.close_conversation(cid))
            completed.set()

        with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=pending_close), \
             mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 1):
            thread = threading.Thread(target=close, daemon=True)
            thread.start()
            try:
                self.assertTrue(accepted.wait(1))
                self.assertFalse(completed.wait(0.02), "accepted is not proof of closure")
            finally:
                if request_ids:
                    daemon._apply_extension_result({
                        "conversationId": cid, "requestId": request_ids[0],
                        "status": "done", "ok": True, "text": "closed after tab removal",
                    })
                thread.join(timeout=2)
            self.assertFalse(thread.is_alive())
        self.assertEqual(returned[0]["text"], "closed after tab removal")
        self.assertTrue(returned[0]["ok"])

    def test_close_timeout_and_stale_result_preserve_a_new_request(self) -> None:
        cid = "close-replaced"
        close_ids = []

        def replaced_close(request_id, conversation_id, _caller):
            close_ids.append(request_id)
            daemon._bind_conversation(request_id, conversation_id)
            # An old close cannot later mutate a task now owned by another request.
            self.seed_running(cid, "new-turn")
            return {"ok": True}

        with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=replaced_close), \
             mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 0.01):
            result = daemon.close_conversation(cid)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["requestId"], close_ids[0])
        self.assertTrue(daemon._apply_extension_result({
            "conversationId": cid, "requestId": close_ids[0],
            "status": "done", "ok": True, "text": "stale close success",
        }))
        current = daemon.get_conversation_result(cid)
        self.assertEqual(current["requestId"], "new-turn")
        self.assertEqual(current["status"], "running")
        self.assertEqual(current["text"], "current")
        self.assertEqual(daemon._REQUESTS["new-turn"]["status"], "running")

    def test_late_close_accepted_cannot_reopen_a_completed_request(self) -> None:
        cid = "close-late-accepted"

        def finished(request_id, conversation_id, _caller):
            daemon._bind_conversation(request_id, conversation_id)
            daemon._apply_extension_result({
                "conversationId": conversation_id, "requestId": request_id,
                "status": "done", "ok": True, "text": "closed",
            })
            return {"ok": True}

        with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=finished), \
             mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 0.01), \
             mock.patch.object(daemon, "dispatch_to_doma", side_effect=self.accept_message):
            closed = daemon.close_conversation(cid)
            followup = daemon.send_conversation_message(cid, "NEW TURN")
            daemon._bind_conversation(closed["requestId"], cid)
        self.assertTrue(closed["ok"])
        self.assertEqual(daemon._REQUESTS[closed["requestId"]]["status"], "done")
        self.assertEqual(daemon._TASKS[cid]["requestId"], followup["requestId"])
        self.assertEqual(daemon._TASKS[cid]["status"], "running")


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

    def test_startup_stderr_is_utf8_with_legacy_windows_console_encoding(self) -> None:
        startup_error = "模拟启动失败…"
        script = (
            "import doma_mcp_stdio as s\n"
            "def fail_daemon():\n"
            f"    raise RuntimeError({startup_error!r})\n"
            "s.ensure_daemon=fail_daemon\n"
            "s._heartbeat_once=lambda: None\n"
            "s._heartbeat_loop=lambda: None\n"
            "s.main()\n"
        )
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
                "protocolVersion": "2024-11-05", "capabilities": {},
                "clientInfo": {"name": "test-legacy-stderr", "version": "1.0"}}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        ]
        payload = "".join(json.dumps(request) + "\n" for request in requests).encode("utf-8")
        for encoding in ("cp936", "cp1252"):
            with self.subTest(encoding=encoding):
                env = {**os.environ, "PYTHONIOENCODING": f"{encoding}:surrogateescape",
                       "PYTHONDONTWRITEBYTECODE": "1"}
                env.pop("PYTHONUTF8", None)
                run = subprocess.run(
                    [sys.executable, "-c", script], input=payload,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
                    cwd=Path(__file__).parent, timeout=5,
                )
                self.assertEqual(run.returncode, 0, run.stderr.decode("utf-8", "replace"))
                responses = [json.loads(line) for line in run.stdout.splitlines()]
                self.assertEqual([response["id"] for response in responses], [1, 2])
                self.assertEqual(responses[0]["result"]["serverInfo"]["name"], "doma")
                self.assertTrue(responses[1]["result"]["tools"])
                self.assertIn(startup_error, run.stderr.decode("utf-8", "strict"))

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
        rid = "test-expired-request"
        event = threading.Event()
        task = {"requestId": rid, "status": "running", "updatedAt": 1, "createdAt": 1, "text": "running"}
        request = {"conversationId": cid, "status": "running", "createdAt": 1, "event": event}
        with mock.patch.object(daemon, "_TASKS", {cid: task}), mock.patch.object(daemon, "_REQUESTS", {rid: request}):
            result = daemon.get_conversation_result(cid)
            self.assertEqual(result["status"], "error")
            self.assertIn("超时", result["text"])
            self.assertEqual(request["status"], "error")
            self.assertEqual(request["text"], result["text"])
            self.assertTrue(event.is_set())

    def post_stop(self) -> tuple[int, dict]:
        with tempfile.TemporaryDirectory(prefix="doma-stop-test-") as temporary, \
             mock.patch.dict(os.environ, {"DOMA_BRIDGE_TOKEN_FILE": str(Path(temporary) / "token")}):
            token = bridge_auth.load_or_create_token()
            server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.ControlHTTPHandler)
            server.daemon_threads = True
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            with mock.patch.object(daemon, "CONTROL_PORT", server.server_address[1]):
                thread.start()
                connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=2)
                try:
                    connection.request("POST", "/v1/admin/stop", body="{}", headers={"Authorization": f"Bearer {token}"})
                    response = connection.getresponse()
                    return response.status, json.loads(response.read())
                finally:
                    connection.close()
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=2)

    def test_stop_expires_bound_and_unbound_requests_without_polling(self) -> None:
        event = threading.Event()
        unbound_event = threading.Event()
        task = {"conversationId": "expired", "requestId": "bound", "status": "running", "createdAt": 1}
        requests = {
            "bound": {"conversationId": "expired", "status": "running", "createdAt": 1, "event": event},
            "unbound": {"status": "pending", "createdAt": 1, "event": unbound_event},
        }
        stop_requested = threading.Event()
        with mock.patch.object(daemon, "_TASKS", {"expired": task}), mock.patch.object(daemon, "_REQUESTS", requests), \
             mock.patch.object(daemon, "_STOP_REQUESTED", stop_requested):
            status, reply = self.post_stop()
            self.assertEqual(status, 200)
            self.assertTrue(reply["ok"])
            self.assertTrue(stop_requested.wait(1))
            self.assertEqual(task["status"], "error")
            self.assertTrue(all(req["status"] == "error" for req in requests.values()))
            self.assertTrue(event.is_set())
            self.assertTrue(unbound_event.is_set())

    def test_stop_still_refuses_fresh_turn_and_preserves_it_when_old_request_expires(self) -> None:
        now = time.time()
        task = {"conversationId": "active", "requestId": "fresh", "status": "running", "createdAt": now}
        requests = {
            "old": {"conversationId": "active", "status": "pending", "createdAt": 1},
            "fresh": {"conversationId": "active", "status": "running", "createdAt": now},
        }
        stop_requested = threading.Event()
        with mock.patch.object(daemon, "_TASKS", {"active": task}), mock.patch.object(daemon, "_REQUESTS", requests), \
             mock.patch.object(daemon, "_STOP_REQUESTED", stop_requested):
            status, reply = self.post_stop()
            self.assertEqual(status, 409)
            self.assertEqual(reply["status"], "busy")
            self.assertFalse(stop_requested.is_set())
            self.assertEqual(requests["old"]["status"], "error")
            self.assertEqual(requests["fresh"]["status"], "running")
            self.assertEqual(task["status"], "running")

    def test_stop_refuses_active_records_without_created_at(self) -> None:
        task = {"requestId": "unknown", "status": "running"}
        request = {"conversationId": "unknown", "status": "pending"}
        stop_requested = threading.Event()
        with mock.patch.object(daemon, "_TASKS", {"unknown": task}), mock.patch.object(daemon, "_REQUESTS", {"unknown": request}), \
             mock.patch.object(daemon, "_STOP_REQUESTED", stop_requested):
            status, _ = self.post_stop()
            self.assertEqual(status, 409)
            self.assertFalse(stop_requested.is_set())
            self.assertEqual(task["status"], "running")
            self.assertEqual(request["status"], "pending")

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
