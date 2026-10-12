/** Only persisted, user-visible turn output belongs in an MCP result. */
export type McpResultArtifact = { type: string; title: string; url?: string; path?: string };
export type McpTurnResult = {
  text: string;
  sources: string[];
  artifacts: McpResultArtifact[];
  status: "done" | "error" | "needs_user_input";
};

type ResultMessage = {
  role: string;
  content?: string;
  isProcess?: boolean;
  customUi?: Record<string, unknown>;
};

function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function assembleMcpTurnResult(messages: ResultMessage[]): McpTurnResult {
  const parts: string[] = [];
  const sources = new Set<string>();
  const artifacts: McpResultArtifact[] = [];
  let needsInput = false;
  let hasError = false;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const content = !message.isProcess && typeof message.content === "string" ? message.content.trim() : "";
    if (content) {
      parts.push(content);
      for (const match of content.matchAll(/https?:\/\/[^\s<>\])]+/g)) {
        const url = safeWebUrl(match[0].replace(/[.,;!?，。；！？]+$/, ""));
        if (url) sources.add(url);
      }
    }
    const ui = message.customUi;
    if (!ui || typeof ui !== "object") continue;
    const payload = ui.payload;
    if (!payload || typeof payload !== "object") continue;
    const data = payload as Record<string, unknown>;
    if (ui.type === "FILE_CARD" || ui.type === "FILE_DOWNLOADED") {
      const title = String(data.fileName || data.title || "").trim();
      const url = safeWebUrl(data.url || data.downloadUrl);
      const path = typeof data.filePath === "string" ? data.filePath.trim() : "";
      if (title && (url || path)) {
        artifacts.push({ type: String(ui.type), title, ...(url ? { url } : {}), ...(path ? { path } : {}) });
      }
    } else if (ui.type === "VIDEO_SELECTOR" || ui.type === "USERSCRIPT_SELECTOR") {
      needsInput = true;
      const options = ui.type === "VIDEO_SELECTOR" ? data.videos : data.userscriptList;
      const titles = Array.isArray(options) ? options.slice(0, 10).map((item) =>
        typeof item?.title === "string" ? item.title : "",
      ).filter(Boolean) : [];
      parts.push(`需要用户选择${titles.length ? `：${titles.join("、")}` : "选项"}`);
    } else if (ui.type === "ERROR_CARD") {
      hasError = true;
      const errorText = String(data.message || data.title || "").trim();
      if (errorText) parts.push(errorText);
    }
  }
  const text = parts.join("\n\n").trim();
  if (!text && !artifacts.length) throw new Error("DomA 未返回可消费的最终结果");
  // A final direct question in an MCP turn must be surfaced to the caller so it
  // can ask the user and continue the same conversationId.
  if (/[？?]\s*$/.test(text) && /(?:请|需要|选择|确认|which|choose|confirm|would you)/i.test(text.split(/\n\n/).at(-1) || "")) {
    needsInput = true;
  }
  return { text, sources: [...sources], artifacts, status: hasError ? "error" : needsInput ? "needs_user_input" : "done" };
}
