<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from "vue";
import { useI18n } from "vue-i18n";
import { contextUsageUi, getContextUsageSnapshot } from "@/services/chat/llm/contextUsage";

const props = defineProps<{
  conversationId: string | null | undefined;
}>();

const { t } = useI18n();
const usage = computed(() => {
  void contextUsageUi.version;
  return getContextUsageSnapshot(props.conversationId);
});

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const ringBtnEl = ref<HTMLButtonElement | null>(null);
const panelPosTick = ref(0);

const SEGMENT_DEFS = [
  { key: "system" as const, colorVar: "var(--stay-black)", labelKey: "chat.composer.contextUsage.system" },
  { key: "tools" as const, colorVar: "var(--ctx-tools, #c77dde)", labelKey: "chat.composer.contextUsage.tools" },
  { key: "skills" as const, colorVar: "var(--stay-commandChipBorder, #3674f0)", labelKey: "chat.composer.contextUsage.skills" },
  { key: "summarized" as const, colorVar: "var(--stay-notice, #F81948)", labelKey: "chat.composer.contextUsage.summarized" },
  { key: "conversationText" as const, colorVar: "var(--stay-secondaryFont)", labelKey: "chat.composer.contextUsage.conversationText" },
  { key: "conversationImage" as const, colorVar: "var(--ctx-image, #9CCC9C)", labelKey: "chat.composer.contextUsage.conversationImage" },
];

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k >= 10 ? k.toFixed(1) : k.toFixed(1)}K`.replace(/\.0K$/, "K");
  }
  return String(Math.round(n));
}

function formatLimit(n: number): string {
  return `${Math.round(n / 1000)}K`;
}

const percentLabel = computed(() => `${Math.round(usage.value.percent)}%`);
const tokensLabel = computed(
  () => `~${formatTokens(usage.value.total)} / ${formatLimit(usage.value.limit)}`,
);

const RING_R = 7.5;
const RING_C = 2 * Math.PI * RING_R;
const RING_SIZE = 20;
const RING_CX = RING_SIZE / 2;

/** 圆环进度弧长（单色 --stay-black） */
const ringProgress = computed(() => {
  const pct = Math.min(100, Math.max(0, usage.value.percent)) / 100;
  return Math.min(RING_C, pct * RING_C);
});

const barSegments = computed(() => {
  const u = usage.value;
  const totalForBar = Math.max(u.total, 1);
  return SEGMENT_DEFS.map((def) => {
    const tokens = u[def.key];
    return {
      ...def,
      tokens,
      widthPct: tokens > 0 ? (tokens / Math.max(u.limit, totalForBar)) * 100 : 0,
      label: t(def.labelKey),
    };
  }).filter((s) => s.tokens > 0 || s.key === "system" || s.key === "tools");
});

const legendRows = computed(() =>
  SEGMENT_DEFS.map((def) => ({
    ...def,
    tokens: usage.value[def.key],
    label: t(def.labelKey),
  })),
);

function getComposerBounds(): DOMRect | null {
  const root = rootEl.value;
  if (!root) return null;
  const shell =
    (root.closest(".composer-shell") as HTMLElement | null) ||
    (root.closest(".composer-shell-wrap") as HTMLElement | null);
  return shell?.getBoundingClientRect() ?? null;
}

const panelStyle = computed((): CSSProperties => {
  void panelPosTick.value;
  const el = ringBtnEl.value;
  if (!open.value || !el) {
    return { display: "none" };
  }
  const r = el.getBoundingClientRect();
  const shell = getComposerBounds();
  const shellWidth = shell?.width ?? window.innerWidth;
  const shellRightGap = shell ? Math.max(8, window.innerWidth - shell.right) : 8;
  // 面板整体窄于输入框，并留出左右边距，避免 ChatPanel 收窄时被裁切
  const panelWidth = Math.min(380, Math.max(180, shellWidth - 24));
  const alignRight = Math.max(shellRightGap, window.innerWidth - r.right);
  // 若按 ring 右对齐会让面板左缘超出 shell，则改用 shell 右内边距
  const leftIfAligned = window.innerWidth - alignRight - panelWidth;
  const shellLeft = shell ? shell.left + 8 : 8;
  const right =
    leftIfAligned < shellLeft
      ? Math.max(shellRightGap, window.innerWidth - (shellLeft + panelWidth))
      : alignRight;

  return {
    position: "fixed",
    right: `${right}px`,
    top: `${Math.max(8, r.top - 8)}px`,
    transform: "translateY(-100%)",
    width: `${panelWidth}px`,
    maxWidth: `${Math.max(180, shellWidth - 24)}px`,
    zIndex: 10001,
  };
});

function bumpPanelPosition(): void {
  if (!open.value) return;
  panelPosTick.value += 1;
}

function toggle(): void {
  open.value = !open.value;
  if (open.value) void nextTick(bumpPanelPosition);
}

function onDocPointerDown(e: PointerEvent): void {
  if (!open.value) return;
  const root = rootEl.value;
  const target = e.target as Node | null;
  if (root && target && root.contains(target)) return;
  open.value = false;
}

let composerResizeObserver: ResizeObserver | null = null;

function observeComposerResize(): void {
  composerResizeObserver?.disconnect();
  composerResizeObserver = null;
  const root = rootEl.value;
  if (!root) return;
  const shell =
    (root.closest(".composer-shell") as HTMLElement | null) ||
    (root.closest(".composer-shell-wrap") as HTMLElement | null);
  if (!shell || typeof ResizeObserver === "undefined") return;
  composerResizeObserver = new ResizeObserver(() => bumpPanelPosition());
  composerResizeObserver.observe(shell);
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("resize", bumpPanelPosition);
  observeComposerResize();
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  window.removeEventListener("resize", bumpPanelPosition);
  composerResizeObserver?.disconnect();
  composerResizeObserver = null;
});

watch(open, (v) => {
  if (v) {
    observeComposerResize();
    void nextTick(bumpPanelPosition);
  }
});

watch(
  () => props.conversationId,
  () => {
    open.value = false;
  },
);
</script>

<template>
  <div ref="rootEl" class="ctx-usage">
    <button
      ref="ringBtnEl"
      type="button"
      class="ctx-usage-ring-btn"
      :title="t('chat.composer.contextUsage.title')"
      :aria-label="t('chat.composer.contextUsage.title')"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <svg
        class="ctx-usage-ring"
        :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`"
        :width="RING_SIZE"
        :height="RING_SIZE"
        aria-hidden="true"
      >
        <circle
          class="ctx-usage-ring-track"
          :cx="RING_CX"
          :cy="RING_CX"
          :r="RING_R"
          fill="none"
          stroke-width="2.25"
        />
        <circle
          v-if="ringProgress > 0.01"
          class="ctx-usage-ring-progress"
          :cx="RING_CX"
          :cy="RING_CX"
          :r="RING_R"
          fill="none"
          stroke-width="2.25"
          :stroke-dasharray="`${ringProgress} ${RING_C}`"
          stroke-dashoffset="0"
          stroke-linecap="butt"
          :transform="`rotate(-90 ${RING_CX} ${RING_CX})`"
        />
      </svg>
    </button>

    <div
      v-if="open"
      class="ctx-usage-panel"
      role="dialog"
      :aria-label="t('chat.composer.contextUsage.title')"
      :style="panelStyle"
    >
      <div class="ctx-usage-panel-head">
        <span class="ctx-usage-panel-title">{{ t("chat.composer.contextUsage.title") }}</span>
        <button type="button" class="ctx-usage-panel-close" :aria-label="t('chat.composer.contextUsage.close')" @click="open = false">
          ×
        </button>
      </div>
      <div class="ctx-usage-panel-summary">
        <span>{{ percentLabel }} {{ t("chat.composer.contextUsage.full") }}</span>
        <span class="ctx-usage-panel-tokens">{{ tokensLabel }} Tokens</span>
      </div>
      <div class="ctx-usage-bar" aria-hidden="true">
        <span
          v-for="seg in barSegments"
          :key="seg.key"
          class="ctx-usage-bar-seg"
          :class="{ 'ctx-usage-bar-seg--faded': seg.faded }"
          :style="{ width: `${seg.widthPct}%`, background: seg.colorVar }"
        />
      </div>
      <ul class="ctx-usage-legend">
        <li v-for="row in legendRows" :key="row.key" class="ctx-usage-legend-row">
          <span
            class="ctx-usage-swatch"
            :class="{ 'ctx-usage-swatch--faded': row.faded }"
            :style="{ background: row.colorVar }"
          />
          <span class="ctx-usage-legend-label">{{ row.label }}</span>
          <span class="ctx-usage-legend-value">{{ formatTokens(row.tokens) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="less">
.ctx-usage {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ctx-usage-ring-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  color: var(--stay-secondaryFont, #8a8a8a);

  &:hover {
    opacity: 0.85;
  }
}

.ctx-usage-ring-track {
  stroke: var(--stay-border, #e0e0e0);
}

.ctx-usage-ring-progress {
  stroke: var(--stay-black);
}

.ctx-usage-panel {
  padding: 12px 14px 14px;
  border-radius: 10px;
  border: 1px solid var(--stay-border, #37372f);
  /* 与 SlashCommandMenu / mode menu 一致 */
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
  color: var(--stay-black);
}

.ctx-usage-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.ctx-usage-panel-title {
  font-size: 14px;
  font-weight: 600;
}

.ctx-usage-panel-close {
  border: none;
  background: transparent;
  color: var(--stay-secondaryFont);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.ctx-usage-panel-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--stay-secondaryFont);
  margin-bottom: 8px;
}

.ctx-usage-panel-tokens {
  color: var(--stay-black);
  font-variant-numeric: tabular-nums;
}

.ctx-usage-bar {
  display: flex;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--stay-border, #e0e0e0);
  margin-bottom: 12px;
}

.ctx-usage-bar-seg {
  display: block;
  height: 100%;
  min-width: 0;
}

.ctx-usage-bar-seg--faded {
  opacity: 0.55;
}

.ctx-usage-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ctx-usage-legend-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.ctx-usage-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.ctx-usage-swatch--faded {
  opacity: 0.55;
}

.ctx-usage-legend-label {
  color: var(--stay-black);
}

.ctx-usage-legend-value {
  font-variant-numeric: tabular-nums;
  color: var(--stay-secondaryFont);
}
</style>
