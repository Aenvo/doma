<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="tab-mention-menu"
      :style="menuFixedStyle"
      role="listbox"
      :aria-label="menuTitle"
    >
      <div v-if="menuTitle" class="tab-mention-menu-title">{{ menuTitle }}</div>
      <div ref="scrollBodyEl" class="tab-mention-menu-body">
        <button
          v-for="(item, index) in filteredItems"
          :key="itemKey(item, index)"
          :ref="(el: HTMLButtonElement | null) => setItemRef(index, el)"
          type="button"
          class="tab-mention-item"
          :class="{ active: index === activeIndex, 'tab-mention-item--active-tab': item.active }"
          role="option"
          :aria-selected="index === activeIndex"
          :title="item.url"
          @mousedown.prevent
          @mouseenter="onItemHover(index)"
          @click="emit('select', item)"
        >
          <div class="tab-mention-item-title-row">
            <img
              v-if="item.favIconUrl"
              class="tab-mention-item-favicon"
              :src="item.favIconUrl"
              alt=""
              loading="lazy"
              @error="onFaviconError"
            />
            <span v-else class="tab-mention-item-favicon tab-mention-item-favicon--placeholder" aria-hidden="true" />
            <span class="tab-mention-item-title">{{ item.title || emptyTitleLabel }}</span>
          </div>
          <span class="tab-mention-item-url">{{ item.url || emptyUrlLabel }}</span>
        </button>
        <div v-if="!filteredItems.length" class="tab-mention-menu-empty">
          {{ emptyText }}
        </div>
      </div>

      <div class="tab-mention-menu-footer">
        <div
          v-if="showHistoryPanel"
          class="tab-mention-history-panel"
          role="listbox"
          :aria-label="historyTitle"
        >
          <div v-if="historyTitle" class="tab-mention-history-title">{{ historyTitle }}</div>
          <button
            v-for="(item, index) in historyItems"
            :key="`history-${item.url}-${index}`"
            type="button"
            class="tab-mention-history-item"
            role="option"
            @mousedown.prevent
            @click="onPickHistory(item)"
          >
            <span class="tab-mention-history-item-text">
              <span class="tab-mention-history-item-title">{{ item.title }}</span>
              <span class="tab-mention-history-item-sep">-</span>
              <span class="tab-mention-history-item-url">{{ historyItemAddressBarText(item.url) }}</span>
            </span>
          </button>
        </div>

        <div class="tab-mention-url-row" @mousedown.stop>
          <div class="tab-mention-url-input-shell">
            <div
              v-if="autocompleteSuffix"
              class="tab-mention-url-input-mirror"
              aria-hidden="true"
            >
              <span class="tab-mention-url-input-mirror-ghost">{{ urlInput }}</span><span class="tab-mention-url-input-mirror-suffix">{{ autocompleteSuffix }}</span>
            </div>
            <input
              ref="urlInputEl"
              v-model="urlInput"
              type="text"
              class="tab-mention-url-input"
              :placeholder="newTabPlaceholder"
              spellcheck="false"
              autocomplete="off"
              @focus="onUrlInputFocus"
              @blur="onUrlInputBlur"
              @input="onUrlInput"
              @keydown.stop="onUrlInputKeydown"
            />
          </div>
          <button
            type="button"
            class="tab-mention-url-confirm"
            :disabled="!canConfirmUrl"
            @mousedown.prevent
            @click="confirmUrlInput"
          >
            {{ newTabConfirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { filterTabMentionItems } from "./tabMentionFilter";
import { searchTabMentionHistory, type TabMentionHistoryItem } from "./tabMentionHistory";
import {
  findHistoryAutocompleteMatch,
  historyItemAddressBarText,
  normalizeTabMentionUrl,
  tabMentionUrlDisplayTitle,
} from "./tabMentionUrl";
import type { TabMentionMenuViewItem, TabUrlSelectPayload } from "./types";

const props = defineProps<{
  visible: boolean;
  menuTitle: string;
  emptyText?: string;
  emptyTitleLabel?: string;
  emptyUrlLabel?: string;
  newTabPlaceholder?: string;
  newTabConfirmLabel?: string;
  historyTitle?: string;
  items: TabMentionMenuViewItem[];
  query: string;
  activeIndex: number;
  scrollActiveTick?: number;
  anchorEl?: HTMLElement | null;
  onHoverIndex?: (index: number) => void;
}>();

const emit = defineEmits<{
  (e: "select", item: TabMentionMenuViewItem): void;
  (e: "selectUrl", payload: TabUrlSelectPayload): void;
}>();

const itemRefs = ref<Array<HTMLElement | null>>([]);
const scrollBodyEl = ref<HTMLElement | null>(null);
const urlInputEl = ref<HTMLInputElement | null>(null);
const urlInput = ref("");
const urlInputFocused = ref(false);
const historyItems = ref<TabMentionHistoryItem[]>([]);
/** 从历史记录点选后暂存 title，点 OK 时使用 */
const pickedHistoryTitle = ref<string | undefined>(undefined);
/** 点选历史项后暂时隐藏历史面板，直到用户再次输入 */
const historyPanelSuppressed = ref(false);
/** 删除输入时不展示地址栏补全，仅刷新 history 列表 */
const autocompleteSuppressed = ref(false);
let historySearchTimer: ReturnType<typeof setTimeout> | null = null;
let historySearchSeq = 0;
let skipClearPickedHistoryTitle = false;
let prevUrlInputLength = 0;

function syncUrlInputLengthTracker() {
  prevUrlInputLength = urlInput.value.length;
}

function itemKey(item: TabMentionMenuViewItem, index: number): string {
  if (item.tabId != null) return `tab-${item.tabId}`;
  return `tab-url-${index}-${item.url}`;
}

function setItemRef(index: number, el: HTMLElement | null) {
  itemRefs.value[index] = el;
}

function onItemHover(index: number) {
  props.onHoverIndex?.(index);
}

function onFaviconError(e: Event) {
  const img = e.target as HTMLImageElement | null;
  if (img) img.style.visibility = "hidden";
}

function scrollActiveItemIntoView() {
  const el = itemRefs.value[props.activeIndex];
  if (!el) return;
  const container = el.closest(".tab-mention-menu-body") as HTMLElement | null;
  if (!container) return;

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (elRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - elRect.top;
  } else if (elRect.bottom > containerRect.bottom) {
    container.scrollTop += elRect.bottom - containerRect.bottom;
  }
}

function scheduleScrollActiveItemIntoView() {
  void nextTick(() => {
    scrollActiveItemIntoView();
    void nextTick(scrollActiveItemIntoView);
  });
}

const positionTick = ref(0);

function bumpPosition() {
  positionTick.value++;
}

const filteredItems = computed(() => filterTabMentionItems(props.items, props.query));

const showHistoryPanel = computed(
  () =>
    urlInputFocused.value
    && urlInput.value.trim().length > 0
    && historyItems.value.length > 0
    && !historyPanelSuppressed.value,
);

const autocompleteMatch = computed(() => {
  if (autocompleteSuppressed.value) return null;
  if (!urlInputFocused.value || !urlInput.value) return null;
  return findHistoryAutocompleteMatch(urlInput.value, historyItems.value);
});

const autocompleteSuffix = computed(() => autocompleteMatch.value?.suffix ?? "");

const effectiveUrlInputText = computed(() => {
  const match = autocompleteMatch.value;
  if (match?.suffix) return match.fullText;
  return urlInput.value;
});

const canConfirmUrl = computed(() => normalizeTabMentionUrl(effectiveUrlInputText.value) != null);

async function runHistorySearch(query: string) {
  const q = query.trim();
  if (!q) {
    historyItems.value = [];
    return;
  }
  const seq = ++historySearchSeq;
  const items = await searchTabMentionHistory(q);
  if (seq !== historySearchSeq) return;
  historyItems.value = items;
}

function onUrlInput() {
  const nextLen = urlInput.value.length;
  autocompleteSuppressed.value = nextLen < prevUrlInputLength;
  prevUrlInputLength = nextLen;

  historyPanelSuppressed.value = false;
  if (!skipClearPickedHistoryTitle) {
    pickedHistoryTitle.value = undefined;
  }
  skipClearPickedHistoryTitle = false;
  const q = urlInput.value.trim();
  if (!q) {
    historyItems.value = [];
    if (historySearchTimer) {
      clearTimeout(historySearchTimer);
      historySearchTimer = null;
    }
    return;
  }
  if (historySearchTimer) clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(() => {
    historySearchTimer = null;
    void runHistorySearch(urlInput.value);
  }, 180);
}

function onUrlInputFocus() {
  urlInputFocused.value = true;
  if (!urlInput.value.trim()) {
    historyItems.value = [];
  }
}

function onUrlInputKeydown(e: KeyboardEvent) {
  if (e.key === "Tab" && autocompleteSuffix.value) {
    e.preventDefault();
    acceptAutocomplete();
    return;
  }
  if (e.key === "ArrowRight" && autocompleteSuffix.value && urlInputEl.value) {
    const atEnd = urlInputEl.value.selectionStart === urlInput.value.length
      && urlInputEl.value.selectionEnd === urlInput.value.length;
    if (atEnd) {
      e.preventDefault();
      acceptAutocomplete();
      return;
    }
  }
  if (e.key === "Enter") {
    e.preventDefault();
    confirmUrlInput();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    urlInputEl.value?.blur();
  }
}

function acceptAutocomplete() {
  const match = autocompleteMatch.value;
  if (!match) return;
  skipClearPickedHistoryTitle = true;
  urlInput.value = match.fullText;
  pickedHistoryTitle.value = match.itemTitle;
  autocompleteSuppressed.value = false;
  syncUrlInputLengthTracker();
}

function onUrlInputBlur() {
  window.setTimeout(() => {
    urlInputFocused.value = false;
  }, 120);
}

function emitUrlPayload(url: string, title?: string) {
  const normalized = normalizeTabMentionUrl(url);
  if (!normalized) return;
  emit("selectUrl", {
    url: normalized,
    title: tabMentionUrlDisplayTitle(normalized, title),
  });
  urlInput.value = "";
  pickedHistoryTitle.value = undefined;
  autocompleteSuppressed.value = false;
  syncUrlInputLengthTracker();
  historyItems.value = [];
  urlInputFocused.value = false;
}

function confirmUrlInput() {
  const match = autocompleteMatch.value;
  emitUrlPayload(
    effectiveUrlInputText.value,
    pickedHistoryTitle.value ?? match?.itemTitle,
  );
}

function onPickHistory(item: TabMentionHistoryItem) {
  skipClearPickedHistoryTitle = true;
  urlInput.value = historyItemAddressBarText(item.url);
  pickedHistoryTitle.value = item.title;
  autocompleteSuppressed.value = true;
  syncUrlInputLengthTracker();
  historyItems.value = [];
  historyPanelSuppressed.value = true;
  void nextTick(() => {
    urlInputEl.value?.focus();
    const len = urlInput.value.length;
    urlInputEl.value?.setSelectionRange(len, len);
  });
}

watch(
  () => props.query,
  () => {
    itemRefs.value = [];
  },
);

watch(
  () => filteredItems.value.length,
  () => {
    itemRefs.value = [];
  },
);

watch(
  () => props.scrollActiveTick,
  () => {
    if (props.visible) scheduleScrollActiveItemIntoView();
  },
);

watch(
  () => props.activeIndex,
  () => {
    if (props.visible) scheduleScrollActiveItemIntoView();
  },
);

watch(
  () => props.visible,
  (open) => {
    if (open) {
      urlInput.value = "";
      pickedHistoryTitle.value = undefined;
      historyPanelSuppressed.value = false;
      autocompleteSuppressed.value = false;
      prevUrlInputLength = 0;
      historyItems.value = [];
      urlInputFocused.value = false;
      void nextTick(() => {
        bumpPosition();
        scheduleScrollActiveItemIntoView();
      });
    } else {
      if (historySearchTimer) {
        clearTimeout(historySearchTimer);
        historySearchTimer = null;
      }
    }
  },
);

watch(
  () => [props.query, props.items.length] as const,
  () => {
    if (props.visible) bumpPosition();
  },
);

onMounted(() => {
  window.addEventListener("resize", bumpPosition);
  window.addEventListener("scroll", bumpPosition, true);
});

onUnmounted(() => {
  window.removeEventListener("resize", bumpPosition);
  window.removeEventListener("scroll", bumpPosition, true);
  if (historySearchTimer) clearTimeout(historySearchTimer);
});

const menuFixedStyle = computed((): CSSProperties => {
  void positionTick.value;
  const el = props.anchorEl;
  if (!el) {
    return { display: "none" };
  }
  const r = el.getBoundingClientRect();
  // 锚点上方可用高度，避免菜单被压到视口外后内部区域被挤扁
  const top = Math.max(8, r.top - 6);
  const availableAbove = Math.max(180, top - 8);
  const maxHeight = Math.min(420, availableAbove);
  return {
    position: "fixed",
    top: `${top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    maxHeight: `${maxHeight}px`,
    transform: "translateY(-100%)",
    zIndex: 10001,
  };
});
</script>

<style scoped lang="less">
.tab-mention-menu {
  display: flex;
  flex-direction: column;
  /* 实际高度由 menuFixedStyle.maxHeight（可用上方空间）约束 */
  max-height: inherit;
  overflow: hidden;
  padding: 6px 0 0;
  border-radius: 10px;
  border: 1px solid var(--stay-border, #37372f);
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.tab-mention-menu-title {
  flex-shrink: 0;
  padding: 8px 12px 0;
  margin-bottom: 4px;
  font-size: var(--stay-text-subbody, 13px);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
  color: var(--stay-black, #2f3134);
  background: var(--stay-background, #f8f8f6);
}

.tab-mention-menu-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 4px;
}

.tab-mention-menu-empty {
  padding: 8px 12px 10px;
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.35;
  text-align: left;
}

.tab-mention-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: background 0.12s ease;

  &:hover,
  &.active {
    background: var(--stay-backgroundTertiary, #eeeeee);
  }

  &--active-tab .tab-mention-item-title {
    font-weight: 600;
  }
}

.tab-mention-item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tab-mention-item-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  object-fit: contain;
  display: block;

  &--placeholder {
    border-radius: 3px;
    background: var(--stay-border, #c8c8c8);
  }
}

.tab-mention-item-title {
  flex: 1;
  min-width: 0;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  line-height: 1.3;
  color: var(--stay-black, #2f3134);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-mention-item-url {
  padding-left: 24px;
  font-size: var(--stay-text-footnote, 12px);
  line-height: 1.35;
  color: var(--stay-secondaryFont, #8a8a8a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-mention-menu-footer {
  flex-shrink: 0;
  position: relative;
  border-top: 1px solid var(--stay-border, #37372f);
  background: var(--stay-background, #f8f8f6);
  padding: 8px 10px 10px;
  box-sizing: border-box;
}

.tab-mention-history-panel {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(100% + 4px);
  max-height: min(200px, 28vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--stay-border, #37372f);
  border-radius: 8px;
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 2;
}

.tab-mention-history-title {
  padding: 6px 10px 4px;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 600;
  color: var(--stay-black, #2f3134);
}

.tab-mention-history-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background: var(--stay-backgroundTertiary, #eeeeee);
  }
}

.tab-mention-history-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  line-height: 1.35;
  gap: 0;
}

.tab-mention-history-item-title {
  flex: 0 0 auto;
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
  color: var(--stay-black, #2f3134);
}

.tab-mention-history-item-sep {
  flex: 0 0 auto;
  color: var(--stay-black, #2f3134);
  margin: 0 0.333em;
}

.tab-mention-history-item-url {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--stay-secondaryFont, #8a8a8a);
}

.tab-mention-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tab-mention-url-input-shell {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--stay-border, #37372f);
  border-radius: 15px;
  background: var(--stay-backgroundSecondary, #fff);
  box-sizing: border-box;
  overflow: hidden;

  &:focus-within {
    border-color: var(--stay-black, #2f3134);
  }
}

.tab-mention-url-input-mirror {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: var(--stay-text-footnote, 12px);
  line-height: 1.3;
  white-space: pre;
  overflow: hidden;
  pointer-events: none;
  box-sizing: border-box;
}

.tab-mention-url-input-mirror-ghost {
  color: transparent;
}

.tab-mention-url-input-mirror-suffix {
  background: var(--stay-primary);
  color: #fff;
}

.tab-mention-url-input {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--stay-black, #2f3134);
  font-size: var(--stay-text-footnote, 12px);
  line-height: 1.3;
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: var(--stay-secondaryFont, #8a8a8a);
  }
}

.tab-mention-url-confirm {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--stay-black, #2f3134);
  border-radius: 15px;
  background: var(--stay-black, #2f3134);
  color: var(--stay-background, #f8f8f6);
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  cursor: pointer;
  box-sizing: border-box;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    opacity: 0.92;
  }
}
</style>
