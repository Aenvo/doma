import { ref } from "vue";

/**
 * Open 薄桩：无账户/下载插槽。
 * ChatPanel iPhone sheet 仍 watch 这两个 ref（恒 false）。
 * Pro 完整实现在 pro/src/.../chatPanelSlotsState.ts，apply-pro 会覆盖本路径。
 */
export const showDownloader = ref(false);
export const showAccountPanel = ref(false);
