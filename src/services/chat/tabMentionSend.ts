import type { TabMentionBlock } from "@/components/chat/chatTypes";
import { formatTabMentionTag } from "@/components/chat/chatTypes";

const INTERACTION_BLOCK_PRIORITY_HINT = "# 最优先使用以下上下文";

/** @ 提及已打开 tab 的发送上下文（可在此扩展） */
export const TAB_MENTION_SEND_HINTS: string[] = [
  "- 目标标签页见 tab 标签中的 tabId、title、url",
  "- 总结当前对话上下文，看是否有到目标标签页的任务。",
  "- 发现有任务调用 browser_call_tab 工具, targetTabId 是 tab 标签中的 tabId, instruction 是总结出来的任务。",
];

/** @ 提及新标签页 URL（无 tabId）的发送上下文（可在此扩展） */
export const TAB_URL_MENTION_SEND_HINTS: string[] = [
  "- 目标为新标签页 URL（尚未打开），见 tab 标签中的 url、title",
  "- 总结当前对话上下文，看是否有到目标URL的任务。",
  "- 发现有任务调用 browser_call_tab 工具, url 是 tab 标签中的 url, instruction 是总结出来的任务。",
];

function wrapTabMentionInteractionBlock(tab: TabMentionBlock): string {
  const hints =
    tab.tabId != null && tab.tabId > 0
      ? TAB_MENTION_SEND_HINTS
      : TAB_URL_MENTION_SEND_HINTS;
  const lines = [
    INTERACTION_BLOCK_PRIORITY_HINT,
    ...hints,
    formatTabMentionTag(tab),
  ];
  return `<interactionBlock>\n${lines.join("\n")}\n</interactionBlock>`;
}

/** 将 tab 包进 interactionBlock，trailing 为去掉 tab chip 后的其余消息片段序列化结果 */
export function buildTabMentionSendText(tab: TabMentionBlock, trailing: string): string {
  return `${wrapTabMentionInteractionBlock(tab)}${trailing}`;
}
