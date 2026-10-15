"""Close receipts outlive the side panel, without becoming a task-routing client."""
import json
import socket
import struct
import threading
import time
import unittest
from unittest import mock

import doma_bridge_daemon as daemon


class CloseCompletionTests(unittest.TestCase):
    def setUp(self):
        for name, value in (("_TASKS", {}), ("_REQUESTS", {}), ("_REQUEST_TO_CONVERSATION", {}),
                            ("_CLIENTS", []), ("_CLIENT_META", {}), ("_REQUEST_CLIENTS", {}),
                            ("_CONVERSATION_CLIENTS", {}), ("_CONVERSATION_TAB_IDS", {})):
            patch = mock.patch.object(daemon, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.cid, self.rid, self.token = "fixture-conversation", "fixture-close", "a" * 32
        daemon._TASKS[self.cid] = {"conversationId": self.cid, "requestId": "previous", "status": "done", "createdAt": time.time()}
        daemon._REQUESTS[self.rid] = {"requestId": self.rid, "conversationId": self.cid, "operation": "close",
            "completionToken": self.token, "previousRequestId": "previous", "status": "pending", "event": threading.Event(), "createdAt": time.time()}
        self.claim = {"type": "close_claim", "requestId": self.rid, "conversationId": self.cid, "completionToken": self.token}

    def test_capability_is_bound_to_exact_close_request(self):
        for patch in ({"completionToken": "wrong"}, {"completionToken": "中" * 32}, {"conversationId": "other"}, {"requestId": "other"}, {"completionToken": None}):
            self.assertIsNone(daemon._claim_close_completion({**self.claim, **patch}))
        daemon._REQUESTS[self.rid]["operation"] = "message"
        self.assertIsNone(daemon._claim_close_completion(self.claim))
        self.assertEqual(daemon._TASKS[self.cid]["requestId"], "previous")

    def test_claim_binds_before_accepted_and_late_accepted_preserves_completion(self):
        self.assertEqual(daemon._claim_close_completion(self.claim)["status"], "running")
        self.assertFalse(daemon._REQUESTS[self.rid]["event"].is_set())
        daemon._apply_extension_result({"conversationId": self.cid, "requestId": self.rid, "status": "done", "ok": True, "text": "closed"})
        daemon._bind_conversation(self.rid, self.cid)
        ready = daemon._claim_close_completion(self.claim)
        self.assertEqual(ready["status"], "done")
        self.assertEqual(ready["text"], "closed")
        self.assertTrue(daemon._REQUESTS[self.rid]["event"].is_set())

    def test_replaced_request_cannot_rebind_or_finish_new_turn(self):
        daemon._TASKS[self.cid].update(requestId="new-turn", status="running", text="new output")
        ready = daemon._claim_close_completion(self.claim)
        self.assertEqual(ready["status"], "error")
        daemon._apply_extension_result({"conversationId": self.cid, "requestId": self.rid, "status": "done", "ok": True, "text": "stale"})
        self.assertEqual(daemon._TASKS[self.cid]["requestId"], "new-turn")
        self.assertEqual(daemon._TASKS[self.cid]["text"], "new output")

    def test_dispatch_includes_only_the_close_capability(self):
        panel = object()
        daemon._CLIENTS.append(panel)
        daemon._CONVERSATION_CLIENTS[self.cid] = panel
        sent = []
        with mock.patch.object(daemon, "_send_task", side_effect=lambda _client, payload: sent.append(payload) or True):
            self.assertTrue(daemon.dispatch_close_to_doma(self.rid, self.cid, "fixture")["ok"])
        self.assertEqual(sent[0]["completionToken"], self.token)

    def test_concurrent_close_cannot_replace_pending_or_running_close(self):
        for status in ("pending", "running"):
            with self.subTest(status=status):
                daemon._REQUESTS.clear()
                daemon._REQUEST_TO_CONVERSATION.clear()
                daemon._TASKS[self.cid].update(requestId="previous", status="done")
                dispatched, release = threading.Event(), threading.Event()
                outcomes = []

                def dispatch(rid, cid, _caller):
                    claim = {"requestId": rid, "conversationId": cid,
                             "completionToken": daemon._REQUESTS[rid]["completionToken"]}
                    if status == "running":
                        daemon._claim_close_completion(claim)
                    dispatched.set()
                    release.wait(2)
                    daemon._claim_close_completion(claim)
                    daemon._apply_extension_result({"requestId": rid, "conversationId": cid,
                        "status": "done", "ok": True, "text": "closed once"})
                    return {"ok": True}

                with mock.patch.object(daemon, "dispatch_close_to_doma", side_effect=dispatch) as send, \
                     mock.patch.object(daemon, "BIND_TIMEOUT_SEC", 0.1):
                    first = threading.Thread(target=lambda: outcomes.append(daemon.close_conversation(self.cid)), daemon=True)
                    first.start()
                    try:
                        self.assertTrue(dispatched.wait(2))
                        second = daemon.close_conversation(self.cid)
                        self.assertFalse(second["ok"])
                        self.assertEqual(second["status"], "error")
                        self.assertEqual(send.call_count, 1)
                    finally:
                        release.set()
                        first.join(timeout=2)
                    self.assertFalse(first.is_alive())
                    self.assertEqual(len(outcomes), 1)
                    self.assertTrue(outcomes[0]["ok"])
                    self.assertEqual(outcomes[0]["text"], "closed once")
                    self.assertEqual(len(daemon._REQUESTS), 1)
                    self.assertTrue(next(iter(daemon._REQUESTS.values()))["event"].is_set())

    def test_socket_receipt_survives_panel_disconnect_and_never_becomes_a_panel(self):
        panel = object()
        daemon._CLIENTS.append(panel)
        daemon._CONVERSATION_CLIENTS[self.cid] = panel
        server = daemon.ThreadingHTTPServer(("127.0.0.1", 0), daemon.BridgeWSHandler)
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        with mock.patch.object(daemon, "BRIDGE_PORT", server.server_address[1]):
            thread.start()
            try:
                with socket.create_connection(server.server_address, timeout=2) as connection:
                    connection.settimeout(2)
                    stream = connection.makefile("rb")
                    connection.sendall(("GET /close-result HTTP/1.1\r\n"
                        f"Host: 127.0.0.1:{daemon.BRIDGE_PORT}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                        "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop\r\n\r\n").encode("ascii"))
                    self.assertIn(b"101", stream.readline())
                    while stream.readline() != b"\r\n":
                        pass

                    def send(message):
                        raw = json.dumps(message).encode("utf-8")
                        mask = b"\x01\x02\x03\x04"
                        header = b"\x81" + (bytes([0x80 | len(raw)]) if len(raw) < 126 else b"\xfe" + struct.pack("!H", len(raw)))
                        connection.sendall(header + mask + bytes(value ^ mask[index % 4] for index, value in enumerate(raw)))

                    def receive():
                        header = stream.read(2)
                        size = header[1] & 127
                        if size == 126:
                            size = struct.unpack("!H", stream.read(2))[0]
                        return json.loads(stream.read(size).decode("utf-8"))

                    send(self.claim)
                    self.assertEqual(receive()["status"], "running")
                    self.assertEqual(daemon._CLIENTS, [panel])
                    daemon._CLIENTS.remove(panel)
                    daemon._CONVERSATION_CLIENTS.pop(self.cid)
                    self.assertEqual(daemon._CLIENTS, [])
                    self.assertEqual(daemon._CONVERSATION_CLIENTS, {})
                    result = {"type": "result", "requestId": self.rid, "conversationId": self.cid,
                              "resultId": self.rid, "status": "done", "ok": True, "text": "tabs really removed"}
                    send(result)
                    self.assertEqual(receive(), {"type": "result_ack", "resultId": self.rid})
                    send({**result, "text": "duplicate"})
                    self.assertEqual(receive()["type"], "result_ack")
                    self.assertEqual(daemon.get_conversation_result(self.cid)["text"], result["text"])
                    self.assertTrue(daemon._REQUESTS[self.rid]["event"].is_set())
                    stream.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
