import assert from "node:assert/strict";
import { assembleMcpTurnResult } from "../src/services/chat/mcpResult.ts";

const result = assembleMcpTurnResult([
  { role: "assistant", isProcess: true, content: "private tool output" },
  { role: "assistant", content: "第一段。见 https://example.com/source" },
  { role: "assistant", content: "第二段。", customUi: {
    type: "FILE_CARD", status: "completed",
    payload: { fileName: "report.pdf", url: "https://example.com/report.pdf", dataBase64: "must-not-leak" },
  } },
]);
assert.equal(result.status, "done");
assert.equal(result.text, "第一段。见 https://example.com/source\n\n第二段。");
assert.deepEqual(result.sources, ["https://example.com/source"]);
assert.deepEqual(result.artifacts, [{ type: "FILE_CARD", title: "report.pdf", url: "https://example.com/report.pdf" }]);
assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
assert.doesNotMatch(JSON.stringify(result), /private tool output/);

assert.equal(assembleMcpTurnResult([
  { role: "assistant", content: "请选择 A 还是 B？" },
]).status, "needs_user_input");
assert.equal(assembleMcpTurnResult([{ role: "assistant", customUi: {
  type: "VIDEO_SELECTOR", status: "active", payload: { videos: [{ title: "A" }, { title: "B" }] },
} }]).text, "需要用户选择：A、B");
assert.equal(assembleMcpTurnResult([{ role: "assistant", customUi: {
  type: "ERROR_CARD", status: "error", payload: { message: "下载失败" },
} }]).status, "error");
assert.throws(() => assembleMcpTurnResult([{ role: "assistant", content: "" }]), /未返回可消费/);
assert.throws(() => assembleMcpTurnResult([{ role: "assistant", customUi: {
  type: "PROGRESS", status: "active", payload: { message: "working" },
} }]), /未返回可消费/);

console.log("MCP result assembly passed");
