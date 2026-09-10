/**
 * Ask 模式：禁止「页面/Tab 变更」类 tool。
 * 在 llmService.callTool 之前拦截；名单可继续追加。
 */

/** Ask 模式下禁止的精确 tool 名（可继续追加） */
export const ASK_BLOCKED_PAGE_TOOL_EXACT = new Set<string>([
  "browser_mouse_click",
  "browser_double_click",
  "browser_long_press",
  "browser_drag",
  "browser_hover",
  "browser_press_key",
  "browser_select_option",
  "browser_submit_form",
  "browser_pick_date",
  "browser_toggle_checkbox",
  "browser_multi_select",
  "browser_navigate",
  "browser_close_tab",
  "browser_reload_tab",
  "browser_call_tab",
  "browser_execute_script",
  "browser_scroll",
  "browser_element_add_style",
  "browser_element_remove_style",
  "browser_seek_video",
  "browser_download_videos",
  "browser_skill_block_ad",
  "browser_skill_unblock_ad",
  "browser_skill_tag_ad",
  "browser_skill_tag_delete",
]);

/** Ask 模式下禁止的前缀（click* / type* / set_input_*） */
export const ASK_BLOCKED_PAGE_TOOL_PREFIXES = [
  "browser_click",
  "browser_type",
  "browser_set_input_",
] as const;

/** 本轮用户消息是否为 Ask（interactionBlock 含 <ask/>） */
export function isAskModeUserContent(content: unknown): boolean {
  const text =
    typeof content === "string" ? content : content == null ? "" : JSON.stringify(content);
  return [...text.matchAll(/<interactionBlock>([\s\S]*?)<\/interactionBlock>/gi)].some((m) =>
    /<ask\s*\/?>/i.test(m[1] ?? ""),
  );
}

/**
 * 截图/字幕等 tool 后追加的合成 user（带图或 expiredInNextRound），
 * 不能当成本轮发起消息，否则会丢掉 <ask/> 导致拦截失效。
 */
function isSyntheticFollowUpUser(msg: {
  role: string;
  content?: unknown;
  expiredInNextRound?: boolean;
  expireKind?: string;
}): boolean {
  if (msg.role !== "user") return false;
  if (msg.expiredInNextRound || msg.expireKind === "screenshot" || msg.expireKind === "caption") {
    return true;
  }
  const c = msg.content;
  if (Array.isArray(c)) {
    return c.some(
      (part) =>
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "image_url",
    );
  }
  return false;
}

type HistoryMsg = {
  role: string;
  content?: unknown;
  expiredInNextRound?: boolean;
  expireKind?: string;
};

/** 从后往前找本轮「真实」发起 user（跳过截图跟进 user），是否 Ask 轮 */
export function isAskModeRound(history: HistoryMsg[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (!msg || msg.role !== "user") continue;
    if (isSyntheticFollowUpUser(msg)) continue;
    return isAskModeUserContent(msg.content);
  }
  return false;
}

/** 取本轮真实 user 可见正文（剥 interactionBlock），供续操示例 */
export function getLastUserVisibleGoal(history: HistoryMsg[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (!msg || msg.role !== "user") continue;
    if (isSyntheticFollowUpUser(msg)) continue;
    const raw =
      typeof msg.content === "string" ? msg.content : msg.content == null ? "" : String(msg.content);
    const outside = raw
      .replace(/<interactionBlock>[\s\S]*?<\/interactionBlock>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return outside.slice(0, 120);
  }
  return "";
}

export function isAskBlockedPageTool(
  name: string,
  args: Record<string, unknown>,
): boolean {
  const toolName = String(name ?? "").trim();
  if (!toolName) return false;

  if (toolName === "browser_extension_api") {
    return String(args.op ?? "").toLowerCase() === "call";
  }
  if (ASK_BLOCKED_PAGE_TOOL_EXACT.has(toolName)) return true;
  for (const prefix of ASK_BLOCKED_PAGE_TOOL_PREFIXES) {
    if (toolName.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Ask 拦截后的 tool result。
 * instruction 要求模型用用户本轮语言回复，并引导切 Agent + 续操话术。
 */
export function buildAskPageToolBlockedPayload(
  blockedToolName: string,
  userGoalHint?: string,
): Record<string, unknown> {
  const goal = String(userGoalHint ?? "").trim() || "your original request";
  return {
    ok: false,
    error: "Ask mode: page operation tools are disabled.",
    blockedTool: blockedToolName,
    instruction: [
      "Do not call any page/tab operation tools again.",
      "",
      "Reply to the user briefly, in the same language as the user's latest message:",
      "1. Explain that Ask mode can only analyze and suggest solutions, and cannot click, type, navigate, or otherwise operate the page.",
      "2. To continue execution, switch the mode next to the input from Ask to Agent.",
      "3. After switching, send a clear execute instruction, for example:",
      `   - "Continue: ${goal}"`,
      "   - or repeat the original goal.",
      "4. Do not mention tool names, SoM indexes, or this error payload.",
    ].join("\n"),
  };
}
