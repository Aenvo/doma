import { computed, reactive } from "vue";

/** plan 暂保留类型，UI 已隐藏；后续可重新露出 */
export type ChatComposerMode = "agent" | "ask" | "plan";

const state = reactive<{
  mode: ChatComposerMode;
}>({
  mode: "agent",
});

/** 响应式只读：模板 / computed 中订阅全局模式 */
export const chatComposerMode = computed(() => state.mode);

export function getChatComposerMode(): ChatComposerMode {
  return state.mode;
}

export function setChatComposerMode(mode: ChatComposerMode): void {
  if (mode !== "agent" && mode !== "ask" && mode !== "plan") return;
  state.mode = mode;
}

export function isChatComposerPlanMode(): boolean {
  return state.mode === "plan";
}

export function isChatComposerAskMode(): boolean {
  return state.mode === "ask";
}

export function isChatComposerAgentMode(): boolean {
  return state.mode === "agent";
}
