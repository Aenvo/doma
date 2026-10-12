"""Focused tests for browser-page selection in the local MCP bridge."""

import json
import unittest

import doma_bridge_daemon as bridge


class FakePanel:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_text(self, raw: str) -> None:
        self.sent.append(json.loads(raw))


class TabRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.first = FakePanel()
        self.second = FakePanel()
        with bridge._CLIENTS_LOCK:
            bridge._CLIENTS[:] = [self.first, self.second]
            bridge._CLIENT_META.clear()
            bridge._CLIENT_META.update({
                self.first: {"tabId": 11, "title": "First", "url": "https://example.com/one"},
                self.second: {"tabId": 22, "title": "Second", "url": "https://example.com/two"},
            })
            bridge._REQUEST_CLIENTS.clear()
            bridge._CONVERSATION_CLIENTS.clear()
            bridge._CONVERSATION_TAB_IDS.clear()

    def tearDown(self) -> None:
        with bridge._CLIENTS_LOCK:
            bridge._CLIENTS.clear()
            bridge._CLIENT_META.clear()
            bridge._REQUEST_CLIENTS.clear()
            bridge._CONVERSATION_CLIENTS.clear()
            bridge._CONVERSATION_TAB_IDS.clear()

    def test_multiple_panels_require_selection_without_dispatch(self) -> None:
        result = bridge.dispatch_to_doma("request-1", "summarize", [], "Codex")
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual([item["tabId"] for item in result["candidates"]], [11, 22])
        self.assertEqual(self.first.sent, [])
        self.assertEqual(self.second.sent, [])

    def test_selected_panel_receives_only_its_task(self) -> None:
        result = bridge.dispatch_to_doma("request-2", "summarize", [], "Codex", target_tab_id=22)
        self.assertTrue(result["ok"])
        self.assertEqual(self.first.sent, [])
        self.assertEqual(len(self.second.sent), 1)
        self.assertEqual(self.second.sent[0]["targetTabId"], 22)
        self.assertEqual(self.second.sent[0]["targetUrl"], "https://example.com/two")

    def test_follow_up_routes_to_original_panel(self) -> None:
        bridge.dispatch_to_doma("request-3", "summarize", [], "Codex", target_tab_id=11)
        with bridge._CLIENTS_LOCK:
            bridge._CONVERSATION_CLIENTS["conversation-3"] = self.first
            bridge._CONVERSATION_TAB_IDS["conversation-3"] = 11
        result = bridge.dispatch_to_doma(
            "request-4", "continue", [], "Codex", msg_type="message", conversation_id="conversation-3"
        )
        self.assertTrue(result["ok"])
        self.assertEqual(len(self.first.sent), 2)
        self.assertEqual(self.second.sent, [])
        self.assertIs(bridge._REQUEST_CLIENTS["request-4"], self.first)

        closed = bridge.dispatch_close_to_doma("request-close", "conversation-3", "Codex")
        self.assertTrue(closed["ok"])
        self.assertIs(bridge._REQUEST_CLIENTS["request-close"], self.first)

    def test_reconnected_panel_can_receive_follow_up(self) -> None:
        with bridge._CLIENTS_LOCK:
            bridge._CONVERSATION_CLIENTS["conversation-5"] = self.first
            bridge._CONVERSATION_TAB_IDS["conversation-5"] = 11
            bridge._CLIENTS.remove(self.first)
            replacement = FakePanel()
            bridge._CLIENTS.append(replacement)
            bridge._CLIENT_META[replacement] = {"tabId": 11, "title": "First", "url": "https://example.com/one"}
        result = bridge.dispatch_to_doma(
            "request-5", "continue", [], "Codex", msg_type="message", conversation_id="conversation-5"
        )
        self.assertTrue(result["ok"])
        self.assertEqual(len(replacement.sent), 1)


if __name__ == "__main__":
    unittest.main()
