<template>
  <div class="host-row" v-if="resolvedOptions.length > 0">
    <!-- loading：ChatPanel 在 AI 回复中为 true；仅 data-loading 标记，不阻止交互 -->
    <div
      class="picker-shell"
      :data-loading="loading ? 'true' : 'false'"
      :data-expanded="expanded ? 'true' : 'false'"
    >
      <div
        v-if="expanded"
        class="picker-body"
        role="listbox"
        :aria-label="t('chat.picker.selectConversation')"
      >
        <ul
          ref="listRef"
          class="conversation-list"
          :class="{ 'is-overflowing': expandedOptionsOrdered.length > 3 }"
        >
          <li
            v-for="(opt, index) in expandedOptionsOrdered"
            :key="opt.id || '__current_tab__'"
            class="conversation-li"
          >
            <div class="conversation-li-shell">
              <button
                type="button"
                class="conversation-option"
                role="option"
                :aria-selected="opt.selected ? 'true' : 'false'"
                :aria-label="formatOptionText(opt)"
                :disabled="isEmpty"
                @click="selectOption(opt.id)"
              >
                <div class="option-line-host">
                  <div class="option-line-host-main">
                    <img
                      v-if="opt.icon"
                      class="option-icon"
                      :src="opt.icon"
                      alt=""
                      aria-hidden="true"
                      @error="onIconError"
                    />
                    <span class="summary-host">{{ optionHost(opt) }}</span>
                  </div>
                </div>
                <div class="option-line-title">
                  <span
                    class="summary-title"
                    :title="optionDisplayQuestion(opt)"
                  >
                    {{ optionDisplayQuestion(opt) }}
                  </span>
                  <span
                    v-if="index === expandedOptionsOrdered.length - 1"
                    class="picker-chev-btn option-chev"
                    aria-hidden="true"
                    :title="t('chat.picker.collapse')"
                  >
                    <ChatChevronUpSvg class="picker-chev-icon" />
                  </span>
                </div>
              </button>
              <div
                v-if="shouldShowGroupBadgeInList(opt) || shouldShowCloseButton(opt)"
                class="conversation-li-trailing"
              >
                <span
                  v-if="shouldShowGroupBadgeInList(opt)"
                  class="group-mode-badge"
                  :class="{ 'has-group-color': opt.mode === 'group' }"
                  :style="groupBadgeStyle(opt)"
                >{{ groupBadgeLabel(opt) }}</span>
                <button
                  v-if="shouldShowCloseButton(opt)"
                  type="button"
                  class="conversation-close-btn"
                  :title="t('chat.picker.closeConversation')"
                  :aria-label="t('chat.picker.closeConversation')"
                  @click.stop="closeConversation(opt.id)"
                >
                  {{ t('chat.picker.closeConversation') }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <div
        v-else
        class="picker-summary"
        :class="{ 'is-disabled': isEmpty }"
        role="button"
        tabindex="0"
        :aria-expanded="'false'"
        @click="onCollapsedSummaryClick"
        @keydown.enter.prevent="onCollapsedSummaryClick"
        @keydown.space.prevent="onCollapsedSummaryClick"
      >
        <div class="summary-line-active">
          <div class="summary-line-active-main">
            <img
              v-if="collapsedOption?.icon"
              class="summary-icon"
              :src="collapsedOption.icon"
              alt=""
              aria-hidden="true"
              @error="onIconError"
            />
            <span class="summary-host">{{ optionHost(collapsedOption) }}</span>
          </div>
          <div class="host-row-trailing">
            <span
              v-if="shouldShowGroupBadgeCollapsed(collapsedOption)"
              class="group-mode-badge"
              :class="{ 'has-group-color': collapsedOption?.mode === 'group' }"
              :style="groupBadgeStyle(collapsedOption)"
            >{{ groupBadgeLabel(collapsedOption) }}</span>
            <button
              v-if="shouldShowCloseButton(collapsedOption)"
              type="button"
              class="conversation-close-btn"
              :title="t('chat.picker.closeConversation')"
              :aria-label="t('chat.picker.closeConversation')"
              @click.stop="closeConversation(collapsedOption!.id)"
            >
              {{ t('chat.picker.closeConversation') }}
            </button>
          </div>
        </div>
        <div class="summary-line-meta">
          <span
            class="summary-title"
            :title="optionDisplayQuestion(collapsedOption)"
          >{{ optionDisplayQuestion(collapsedOption) }}</span>
          <span class="summary-right">
            <span class="summary-count">{{ t('chat.picker.openConversationsCount', { count: options.length }) }}</span>
            <span v-if="resolvedOptions.length > 1" class="picker-chev-btn chev" aria-hidden="true">
              <ChatChevronUpSvg class="picker-chev-icon" />
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getContext } from "@/services/Context";
import { isBuiltinNewTabOrStartPageUrl } from "@/services/chat/browserTools";
import { stripUserPromptMarkersForDisplay } from "@/components/chat/chatTypes";
import ChatChevronUpSvg from "@/assets/images/chat-chevron-up.svg";
import {
  getActiveBrowserTabSync,
  subscribeActiveTabChanges,
} from "@/edition/activeBrowserTab";

const { t } = useI18n();

const EMPTY_SELECTED_ID = "";

type ConversationPickerOption = {
  id: string;
  question?: string;
  url?: string;
  icon?: string;
  selected: boolean;
  mode: "single" | "group";
  groupColor?: string;
  groupTitle?: string;
  updatedAt?: number;
};

const props = defineProps<{
  options: ConversationPickerOption[];
  /** 父组件对话进行中为 true（仅作 data-loading 标记，不阻止展开/切换） */
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "change", conversationId: string): void;
  (e: "close", conversationId: string): void;
}>();

const expanded = ref(false);
const listRef = ref<HTMLElement | null>(null);
const currentTabUrl = ref("");
const currentTabIcon = ref("");

let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeActiveTabChanges: (() => void) | null = null;

async function refreshCurrentTabInfo(): Promise<void> {
  const host = getActiveBrowserTabSync();
  if (host?.url || host?.id != null) {
    currentTabUrl.value = host.url || "";
    currentTabIcon.value = host.favIconUrl || "";
    return;
  }
  try {
    const browser = getContext().browser;
    const tabs = await new Promise<any[]>((resolve) => {
      browser.tabs.query({ active: true, currentWindow: true }, (t: any[]) => resolve(t ?? []));
    });
    const tab = tabs[0];
    if (!tab?.url) {
      currentTabUrl.value = "";
      currentTabIcon.value = "";
      return;
    }
    currentTabUrl.value = typeof tab.url === "string" ? tab.url : "";
    const fav = typeof tab.favIconUrl === "string" ? tab.favIconUrl.trim() : "";
    currentTabIcon.value = fav;
  } catch {
    currentTabUrl.value = "";
    currentTabIcon.value = "";
  }
}

function scheduleRefreshCurrentTabInfo(): void {
  if (refreshDebounceTimer != null) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    void refreshCurrentTabInfo();
  }, 200);
}

function createCurrentTabFallback(): ConversationPickerOption {
  return {
    id: EMPTY_SELECTED_ID,
    question: "",
    url: currentTabUrl.value,
    icon: currentTabIcon.value || undefined,
    selected: true,
    mode: "single",
  };
}

/** 无 selected 项时追加当前 tab 占位（id 为空、selected 为 true） */
const resolvedOptions = computed((): ConversationPickerOption[] => {
  const opts = props.options;
  if (opts.some((o) => o.selected)) return opts;
  return [...opts, createCurrentTabFallback()];
});

const isEmpty = computed(() => resolvedOptions.value.length === 0);

/** 父组件 options 里是否有真实选中项（非 fallback「未开始对话」占位） */
const hasRealSelected = computed(() => props.options.some((o) => o.selected));

function isFallbackOption(opt: ConversationPickerOption | undefined): boolean {
  return !opt?.id;
}

function shouldShowCloseButton(opt: ConversationPickerOption | undefined): boolean {
  return !!opt?.id && !isFallbackOption(opt);
}

function shouldShowGroupBadgeInList(opt: ConversationPickerOption | undefined): boolean {
  return !!opt && opt.mode === "group" && !isFallbackOption(opt);
}

/** 收起态：无真实选中（fallback 占位）时不显示 */
function shouldShowGroupBadgeCollapsed(opt: ConversationPickerOption | undefined): boolean {
  if (!hasRealSelected.value) return false;
  return shouldShowGroupBadgeInList(opt);
}

/** Chrome tab group 边框固定用品牌色（不再跟随机 group.color） */
function groupBadgeStyle(opt: ConversationPickerOption | undefined): Record<string, string> | undefined {
  if (!opt || opt.mode !== "group") return undefined;
  return { "--group-badge-color": "var(--stay-primary)" } as Record<string, string>;
}

function groupBadgeLabel(opt: ConversationPickerOption | undefined): string {
  const title = (opt?.groupTitle ?? "").trim();
  if (title) return title;
  return t("chat.picker.groupConversation");
}

/** 收起态展示 `selected: true` 的那一条 */
const collapsedOption = computed(() => {
  return (
    resolvedOptions.value.find((o) => o.selected) ||
    resolvedOptions.value[0]
  );
});

/** 展开列表：其余项按 updatedAt 升序（最新在最下），选中项固定最底部与收起态同一行 */
const expandedOptionsOrdered = computed(() => {
  const opts = resolvedOptions.value;
  const selected = opts.find((o) => o.selected);
  const others = opts
    .filter((o) => !o.selected)
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
  if (!selected) return others;
  return [...others, selected];
});

watch(
  () => props.options.some((o) => o.selected),
  (hasSelected) => {
    if (!hasSelected) void refreshCurrentTabInfo();
  },
  { immediate: true },
);

watch(expanded, async (open) => {
  if (!open) return;
  void refreshCurrentTabInfo();
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
});

function toggleExpanded() {
  if (resolvedOptions.value.length <= 1) return;
  expanded.value = !expanded.value;
}

function onCollapsedSummaryClick() {
  if (isEmpty.value) return;
  toggleExpanded();
}

function onIconError(e: Event) {
  const img = e.target as HTMLImageElement | null;
  if (img) img.style.display = "none";
}

function hostFromUrl(url?: string): string {
  const startPage = t("chat.picker.startPage");
  const raw = (url || "").trim();
  if (!raw || isBuiltinNewTabOrStartPageUrl(raw)) return startPage;
  try {
    const u = new URL(raw);
    return (u.hostname || "").trim() || startPage;
  } catch {
    return startPage;
  }
}

function optionHost(opt: ConversationPickerOption | undefined): string {
  return hostFromUrl(opt?.url);
}

function optionDisplayQuestion(opt: ConversationPickerOption | undefined): string {
  const q = stripUserPromptMarkersForDisplay(opt?.question || "");
  return q || t("chat.picker.noConversationYet");
}

function formatOptionText(opt: ConversationPickerOption): string {
  const host = optionHost(opt);
  const question = optionDisplayQuestion(opt);
  if (host && question) return `${host} · ${question}`;
  return host || question || "";
}

function selectOption(id: string) {
  const opt = resolvedOptions.value.find((o) => o.id === id);
  if (!opt || opt.selected) {
    expanded.value = false;
    return;
  }
  emit("change", id);
  expanded.value = false;
}

function closeConversation(id: string) {
  const trimmed = (id || "").trim();
  if (!trimmed) return;
  emit("close", trimmed);
}

onMounted(() => {
  void refreshCurrentTabInfo();
  unsubscribeActiveTabChanges = subscribeActiveTabChanges(() => {
    scheduleRefreshCurrentTabInfo();
  });
});

onUnmounted(() => {
  if (refreshDebounceTimer != null) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = null;
  }
  if (unsubscribeActiveTabChanges) {
    try {
      unsubscribeActiveTabChanges();
    } catch {
      // ignore
    }
    unsubscribeActiveTabChanges = null;
  }
});
</script>

<style scoped>
.host-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  width: 100%;
}

.picker-shell {
  --picker-row-h: 56px;
  --picker-max-rows: 3;
  --picker-summary-h: 56px;
  --picker-expanded-list-h: calc(
    var(--picker-max-rows) * var(--picker-row-h) +
    (var(--picker-max-rows) - 1) * 1px
  );

  /* 外框由 ChatPanel .composer-stack 统一绘制，此处只负责内容与内部分隔线 */
  width: 100%;
  margin: 0;
  min-height: var(--picker-summary-h);
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid var(--stay-border, #333);
  background: var(--stay-background);
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
  position: relative;
}

.picker-shell[data-expanded="true"] {
  z-index: 1;
}

.picker-summary {
  flex: 0 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: var(--picker-summary-h);
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--stay-black);
  cursor: pointer;
  text-align: left;
  font: inherit;
  overflow: visible;
}

.picker-summary.is-disabled {
  cursor: not-allowed;
}

.conversation-li-shell {
  position: relative;
  width: 100%;
  height: var(--picker-row-h, 56px);
}

.conversation-li-trailing {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 20px);
  pointer-events: auto;
}

.conversation-close-btn {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: var(--stay-backgroundTertiary);
  color: var(--stay-black);
  cursor: pointer;
  white-space: nowrap;
}

.host-row-trailing {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.summary-line-active {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
  overflow: visible;
}

.summary-line-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
  overflow: visible;
}

.summary-line-active-main,
.option-line-host-main {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.group-mode-badge {
  flex: 0 1 auto;
  display: block;
  box-sizing: border-box;
  max-width: 160px;
  min-width: 0;
  font-size: 11px;
  line-height: 1.2;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--stay-black);
  background: var(--stay-backgroundTertiary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-mode-badge.has-group-color {
  box-shadow: inset 0 0 0 1px var(--group-badge-color);
}

.picker-chev-btn {
  flex: 0 0 auto;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--stay-border);
  border-radius: 5px;
  background: var(--stay-backgroundSecondary);
  color: var(--stay-black);
  line-height: 0;
}

.picker-chev-btn :deep(.picker-chev-icon) {
  width: 12px;
  height: 12px;
  display: block;
}

.chev {
  transform: rotate(0deg);
}

.summary-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
}

.summary-right {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: visible;
}

.summary-count {
  font-size: 12px;
  color: color-mix(in srgb, var(--stay-black, #2f3134) 55%, transparent);
}

.summary-host {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--stay-gray, #909090);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--stay-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-body {
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--stay-background);
  padding: 0;
  box-sizing: border-box;
}

.conversation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: var(--picker-expanded-list-h);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--stay-black, #2f3134) 28%, transparent) transparent;
}

.conversation-list.is-overflowing {
  overflow-y: scroll;
}

.conversation-list::-webkit-scrollbar {
  width: 6px;
}

.conversation-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.28);
  border-radius: 3px;
}

.conversation-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}

.conversation-li {
  margin: 0;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.conversation-li:last-child {
  border-bottom: none;
}

.conversation-option {
  width: 100%;
  height: var(--picker-row-h, 56px);
  min-height: var(--picker-row-h, 56px);
  max-height: var(--picker-row-h, 56px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px;
  margin: 0;
  border: none;
  border-radius: 0;
  background: var(--stay-background);
  color: var(--stay-black);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  overflow: hidden;
  -webkit-appearance: none;
  appearance: none;
}

.conversation-option:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.04);
}

.conversation-option:disabled {
  cursor: not-allowed;
}

.option-line-host {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  min-width: 0;
}

.option-line-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.option-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
}

.option-chev {
  transform: rotate(180deg);
}
</style>
