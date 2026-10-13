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

// Native MCP acceptance: a Markdown closing backtick must not become URL %60.
const xSource = "https://x.com/NiallxYoung/status/2101485716286865803";
const inlineCodeContent = `完整 URL：\`${xSource}\``;
const inlineCodeResult = assembleMcpTurnResult([{ role: "assistant", content: inlineCodeContent }]);
assert.equal(inlineCodeResult.text, inlineCodeContent);
assert.deepEqual(inlineCodeResult.sources, [xSource]);
assert.deepEqual(assembleMcpTurnResult([
  { role: "assistant", content: `\`\`\`${xSource}\`\`\`` },
]).sources, [xSource]);

const encodedSource = "https://example.com/a%60b?value=%60&quote=%22x%22#part%60";
assert.deepEqual(assembleMcpTurnResult([
  { role: "assistant", content: `\`${encodedSource}\`。` },
]).sources, [encodedSource]);
const querySource = "https://example.com/a'b?first=one&second=two#details";
assert.deepEqual(assembleMcpTurnResult([
  { role: "assistant", content: `[原文](${querySource})，另见 \`${querySource}\`。` },
]).sources, [querySource]);
assert.deepEqual(assembleMcpTurnResult([
  { role: "user", content: "https://private.example/user" },
  { role: "assistant", isProcess: true, content: "`https://private.example/tool`" },
  { role: "assistant", content: "正文只含 `file:///private/path` 和 `javascript:alert(1)`。" },
]).sources, []);

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
