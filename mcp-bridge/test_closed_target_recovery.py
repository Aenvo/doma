"""Closed-target terminal reconciliation must never grant a viewer an execution route."""
import copy
import unittest
from unittest import mock

import doma_bridge_daemon as daemon


class ClosedTargetRecoveryTests(unittest.TestCase):
    def setUp(self):
        for name, value in (("_CLIENTS", []), ("_CLIENT_META", {}), ("_REQUEST_CLIENTS", {}),
                ("_CONVERSATION_CLIENTS", {}), ("_CONVERSATION_TAB_IDS", {}),
                ("_TASKS", {}), ("_REQUESTS", {}), ("_REQUEST_TO_CONVERSATION", {})):
            patch = mock.patch.object(daemon, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.viewer, self.lost = object(), object()
        self.cid, self.rid = "orphaned-conversation", "orphaned-request"
        daemon._CLIENTS.append(self.viewer)
        daemon._CLIENT_META[self.viewer] = {"tabId": 22}
        daemon._CONVERSATION_CLIENTS[self.cid] = self.lost
        daemon._CONVERSATION_TAB_IDS[self.cid] = 11
        daemon._TASKS[self.cid] = {"conversationId": self.cid, "requestId": self.rid, "status": "running", "text": "running"}
        daemon._REQUESTS[self.rid] = {"conversationId": self.cid, "requestId": self.rid, "status": "running"}
        daemon._REQUEST_TO_CONVERSATION[self.rid] = self.cid
        self.result = {"conversationId": self.cid, "requestId": self.rid, "status": "error", "ok": False,
            "text": "Original target closed; please confirm and retry.", "closedTargetTabIds": [11]}

    def test_precise_orphan_error_finishes_task_and_request_without_rebinding(self):
        self.assertTrue(daemon._accept_panel_result(self.viewer, self.result))
        self.assertEqual(daemon._TASKS[self.cid]["status"], "error")
        self.assertEqual(daemon._REQUESTS[self.rid]["status"], "error")
        self.assertIs(daemon._CONVERSATION_CLIENTS[self.cid], self.lost)
        self.assertFalse(daemon._conversation_connection_state(self.cid)["conversationConnected"])
        self.assertFalse(daemon.dispatch_to_doma("next", "read", [], "test", msg_type="message", conversation_id=self.cid)["ok"])

    def test_viewer_cannot_claim_success_running_or_an_unverified_target(self):
        for patch in ({"status": "done", "ok": True}, {"status": "needs_user_input"}, {"status": "running"},
                {"ok": True}, {"text": ""}, {"closedTargetTabIds": None}, {"closedTargetTabIds": []},
                {"closedTargetTabIds": [True]}, {"closedTargetTabIds": [22]}, {"closedTargetTabIds": [11, 22]},
                {"closedTargetTabIds": ["11"]}, {"requestId": "newer"}, {"conversationId": "other"}):
            with self.subTest(patch=patch):
                before = copy.deepcopy(daemon._TASKS)
                self.assertFalse(daemon._accept_panel_result(self.viewer, {**self.result, **patch}))
                self.assertEqual(daemon._TASKS, before)

    def test_live_or_reconnected_owner_prevents_foreign_interruption(self):
        for same_tab in (False, True):
            owner = object()
            daemon._CLIENTS.append(owner)
            if same_tab:
                daemon._CLIENT_META[owner] = {"tabId": 11}
            else:
                daemon._CONVERSATION_CLIENTS[self.cid] = owner
            self.assertFalse(daemon._accept_panel_result(self.viewer, self.result))
            self.assertEqual(daemon._TASKS[self.cid]["status"], "running")
            daemon._CLIENTS.remove(owner)
            daemon._CONVERSATION_CLIENTS[self.cid] = self.lost

    def test_late_interruption_cannot_overwrite_terminal_or_a_new_request(self):
        for status in ("done", "error", "needs_user_input"):
            daemon._TASKS[self.cid].update(status=status, text="authoritative terminal", ok=True)
            self.assertTrue(daemon._accept_panel_result(self.viewer, self.result))
            self.assertEqual(daemon._TASKS[self.cid]["text"], "authoritative terminal")
        daemon._TASKS[self.cid].update(requestId="newer", status="running", text="new output")
        self.assertFalse(daemon._accept_panel_result(self.viewer, self.result))
        self.assertEqual(daemon._TASKS[self.cid]["text"], "new output")

    def test_unregistered_or_legacy_panel_cannot_reconcile(self):
        self.assertFalse(daemon._accept_panel_result(object(), self.result))
        daemon._CLIENT_META[self.viewer] = {}
        self.assertFalse(daemon._accept_panel_result(self.viewer, self.result))


if __name__ == "__main__":
    unittest.main()
