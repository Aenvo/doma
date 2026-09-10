<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from "vue";
import { useI18n } from "vue-i18n";
import UploadFileToolbar from "../UploadFileToolbar.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";
import TabMentionMenu from "./TabMentionMenu.vue";
import AddSkillDialog from "./AddSkillDialog.vue";
import ContextUsageButton from "./ContextUsageButton.vue";
import ChatScopeSvg from "@/assets/images/chat-scope.svg";
import PaperclipSvg from "@/assets/images/paperclip.svg";
import ChatFolderSvg from "@/assets/images/chat-folder.svg";
import ChatStopSvg from "@/assets/images/chat-stop.svg";
import ChatSendUpSvg from "@/assets/images/chat-send-up.svg";
import {
  chatComposerMode,
  setChatComposerMode,
  type ChatComposerMode,
} from "@/services/chat/chatComposerMode";
import type { AttachedFilePreviewPayload, ChatComposerBinding } from "./types";

const props = defineProps<ChatComposerBinding>();

const emit = defineEmits<{
  previewAttachedFile: [AttachedFilePreviewPayload];
  /** dock 发送按钮右键「定时消息」 */
  scheduleRequest: [];
}>();

const { t } = useI18n();

function handleAttachedFilePreview(payload: AttachedFilePreviewPayload) {
  props.onPreviewAttachedFile?.(payload);
  emit("previewAttachedFile", payload);
}

const composerEl = ref<HTMLDivElement | null>(null);
const composerInputMixEl = ref<HTMLDivElement | null>(null);
const attachFileInputEl = ref<HTMLInputElement | null>(null);
const modeMenuOpen = ref(false);
const modeBtnWrapEl = ref<HTMLDivElement | null>(null);
const modeMenuPosTick = ref(0);
const sendBtnWrapEl = ref<HTMLDivElement | null>(null);
const sendCtxMenuOpen = ref(false);
const sendCtxMenuPos = ref({ x: 0, y: 0 });

const scheduleMenuEnabled = computed(() => props.mode === "dock");

const sendCtxMenuStyle = computed((): CSSProperties => ({
  position: "fixed",
  left: `${sendCtxMenuPos.value.x}px`,
  top: `${sendCtxMenuPos.value.y}px`,
  zIndex: 10060,
  minWidth: "160px",
}));

const modeOptions: Array<{ id: ChatComposerMode; labelKey: string; descKey: string }> = [
  { id: "agent", labelKey: "chat.composer.modeAgent", descKey: "chat.composer.modeAgentDesc" },
  { id: "ask", labelKey: "chat.composer.modeAsk", descKey: "chat.composer.modeAskDesc" },
  // { id: "plan", labelKey: "chat.composer.modePlan", descKey: "chat.composer.modePlanDesc" },
];

const modeLabel = computed(() => {
  if (chatComposerMode.value === "ask") return t("chat.composer.modeAsk");
  // if (chatComposerMode.value === "plan") return t("chat.composer.modePlan");
  return t("chat.composer.modeAgent");
});

const modeMenuStyle = computed((): CSSProperties => {
  void modeMenuPosTick.value;
  const el = modeBtnWrapEl.value;
  if (!modeMenuOpen.value || !el) {
    return { display: "none" };
  }
  const r = el.getBoundingClientRect();
  return {
    position: "fixed",
    left: `${Math.max(8, r.left)}px`,
    top: `${Math.max(8, r.top - 6)}px`,
    transform: "translateY(-100%)",
    zIndex: 10001,
    minWidth: `${Math.max(r.width, 220)}px`,
  };
});

function bumpModeMenuPosition() {
  if (!modeMenuOpen.value) return;
  modeMenuPosTick.value++;
}

function toggleModeMenu() {
  modeMenuOpen.value = !modeMenuOpen.value;
  if (modeMenuOpen.value) void nextTick(bumpModeMenuPosition);
}

function selectComposerMode(mode: ChatComposerMode) {
  setChatComposerMode(mode);
  modeMenuOpen.value = false;
}

function closeSendCtxMenu() {
  sendCtxMenuOpen.value = false;
}

function resolveSendCtxMenuPos(): { x: number; y: number } {
  const anchor = sendBtnWrapEl.value?.getBoundingClientRect();
  const menuW = 160;
  const menuH = 44;
  const pad = 8;
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;

  if (!anchor) return { x: pad, y: pad };

  let x = anchor.right - menuW;
  let y = anchor.top - menuH - 6;
  if (y < pad) y = anchor.bottom + 6;

  x = Math.max(pad, Math.min(x, vw - menuW - pad));
  y = Math.max(pad, Math.min(y, vh - menuH - pad));
  return { x, y };
}

/** 捕获阶段拦截，避免 disabled/子 SVG 导致 handler 收不到 */
function onSendContextMenu(e: Event) {
  if (!scheduleMenuEnabled.value) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof (e as MouseEvent).stopImmediatePropagation === "function") {
    (e as MouseEvent).stopImmediatePropagation();
  }
  sendCtxMenuPos.value = resolveSendCtxMenuPos();
  sendCtxMenuOpen.value = true;
}

function onScheduleMenuClick(e?: Event) {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if (!props.canSend) {
    closeSendCtxMenu();
    return;
  }
  closeSendCtxMenu();
  // nextTick：等右键菜单卸掉再开弹框，避免同一次点击穿透到 overlay 立刻关掉
  void nextTick(() => {
    emit("scheduleRequest");
  });
}

function onSendBtnClick(e: MouseEvent) {
  if (!props.canSend) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  props.onSendClick?.();
}

function onDocumentPointerDown(e: PointerEvent) {
  if (sendCtxMenuOpen.value) {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.(".send-ctx-menu")) {
      closeSendCtxMenu();
    }
  }
  if (!modeMenuOpen.value) return;
  const root = modeBtnWrapEl.value;
  const target = e.target as Node | null;
  if (root && target && root.contains(target)) return;
  modeMenuOpen.value = false;
}

watch(modeMenuOpen, (open) => {
  if (open) void nextTick(bumpModeMenuPosition);
});

watch(
  sendBtnWrapEl,
  (el, prev) => {
    if (prev) {
      prev.removeEventListener("contextmenu", onSendContextMenu, true);
    }
    if (el && scheduleMenuEnabled.value) {
      el.addEventListener("contextmenu", onSendContextMenu, true);
    }
  },
  { flush: "post", immediate: true },
);

onMounted(() => {
  // Plan 暂隐藏：若内存态仍是 plan，回落 agent
  if (chatComposerMode.value === "plan") {
    setChatComposerMode("agent");
  }
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  window.addEventListener("resize", bumpModeMenuPosition);
  window.addEventListener("scroll", bumpModeMenuPosition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  window.removeEventListener("resize", bumpModeMenuPosition);
  window.removeEventListener("scroll", bumpModeMenuPosition, true);
  sendBtnWrapEl.value?.removeEventListener("contextmenu", onSendContextMenu, true);
  closeSendCtxMenu();
});

defineExpose({
  get composerEl() {
    return composerEl.value;
  },
  get attachFileInputEl() {
    return attachFileInputEl.value;
  },
});
</script>

<template>
  <div
    class="composer-shell-wrap"
    :class="{ 'composer-shell-wrap--inline': mode === 'inline' }"
  >
    <div class="composer-shell">
      <UploadFileToolbar
        :files="attachedFiles"
        @remove="onRemoveAttachedFile"
        @preview="handleAttachedFilePreview"
      />
      <div ref="composerInputMixEl" class="composer-input-mix">
        <SlashCommandMenu
          v-if="slashCommandMenu"
          :visible="slashCommandMenu.visible"
          :skill-title="slashCommandMenu.skillTitle"
          :command-title="slashCommandMenu.commandTitle"
          :empty-text="slashCommandMenu.emptyText"
          :skill-items="slashCommandMenu.skillItems"
          :command-items="slashCommandMenu.commandItems"
          :query="slashCommandMenu.query"
          :active-index="slashCommandMenu.activeIndex"
          :scroll-active-tick="slashCommandMenu.scrollActiveTick"
          :anchor-el="composerInputMixEl"
          :on-hover-index="slashCommandMenu.onHoverIndex"
          :add-skill-label="slashCommandMenu.addSkillLabel"
          :add-skill-footer-index="slashCommandMenu.addSkillFooterIndex"
          :builtin-badge-label="slashCommandMenu.builtinBadgeLabel"
          :edit-skill-label="slashCommandMenu.editSkillLabel"
          @select="slashCommandMenu.onSelect"
          @add-skill="slashCommandMenu.onAddSkill?.()"
          @edit-skill="slashCommandMenu.onEditSkill?.($event)"
        />
        <TabMentionMenu
          v-if="tabMentionMenu"
          :visible="tabMentionMenu.visible"
          :menu-title="tabMentionMenu.menuTitle"
          :empty-text="tabMentionMenu.emptyText"
          :empty-title-label="tabMentionMenu.emptyTitleLabel"
          :empty-url-label="tabMentionMenu.emptyUrlLabel"
          :new-tab-placeholder="tabMentionMenu.newTabPlaceholder"
          :new-tab-confirm-label="tabMentionMenu.newTabConfirmLabel"
          :history-title="tabMentionMenu.historyTitle"
          :items="tabMentionMenu.items"
          :query="tabMentionMenu.query"
          :active-index="tabMentionMenu.activeIndex"
          :scroll-active-tick="tabMentionMenu.scrollActiveTick"
          :anchor-el="composerInputMixEl"
          :on-hover-index="tabMentionMenu.onHoverIndex"
          @select="tabMentionMenu.onSelect"
          @select-url="tabMentionMenu.onSelectUrl?.($event)"
        />
        <AddSkillDialog
          v-if="addSkillDialog"
          :visible="addSkillDialog.visible"
          :mode="addSkillDialog.mode"
          :title="addSkillDialog.title"
          :name-label="addSkillDialog.nameLabel"
          :name-placeholder="addSkillDialog.namePlaceholder"
          :allow-model-route-label="addSkillDialog.allowModelRouteLabel"
          :description-label="addSkillDialog.descriptionLabel"
          :description-placeholder="addSkillDialog.descriptionPlaceholder"
          :body-label="addSkillDialog.bodyLabel"
          :cancel-text="addSkillDialog.cancelText"
          :save-text="addSkillDialog.saveText"
          :saving-text="addSkillDialog.savingText"
          :delete-text="addSkillDialog.deleteText"
          :deleting-text="addSkillDialog.deletingText"
          :export-text="addSkillDialog.exportText"
          :exporting-text="addSkillDialog.exportingText"
          :saving="addSkillDialog.saving"
          :deleting="addSkillDialog.deleting"
          :exporting="addSkillDialog.exporting"
          :submit-error="addSkillDialog.submitError"
          :initial-name="addSkillDialog.initialName"
          :initial-allow-model-route="addSkillDialog.initialAllowModelRoute"
          :initial-description="addSkillDialog.initialDescription"
          :initial-body="addSkillDialog.initialBody"
          @update:visible="(v) => { if (!v) addSkillDialog?.onCancel(); }"
          @cancel="addSkillDialog.onCancel"
          @save="addSkillDialog.onSave"
          @delete="addSkillDialog.onDelete?.()"
          @export="addSkillDialog.onExport?.($event)"
        />
        <div
          ref="composerEl"
          class="chat-input chat-input--mixed"
          :contenteditable="composerContentEditable"
          spellcheck="false"
          role="textbox"
          :aria-disabled="false"
          :data-empty="composerDataEmpty ? 'true' : 'false'"
          :data-placeholder="placeholder"
          @keydown="onComposerKeydown"
          @paste.capture="onComposerPaste"
          @input="onComposerInput"
          @click="onComposerClick"
          @dragenter.prevent="onComposerDragEnter"
          @dragover.prevent="onComposerDragOver"
          @dragleave.prevent="onComposerDragLeave"
          @drop.prevent="onComposerDrop"
        />
      </div>

      <div class="control-row">
        <div class="left-controls">
          <div ref="modeBtnWrapEl" class="composer-mode-wrap">
            <button
              type="button"
              class="composer-mode-btn"
              :class="{ 'composer-mode-btn--ask': chatComposerMode === 'ask' }"
              :aria-expanded="modeMenuOpen"
              :aria-label="t('chat.composer.modeMenuAria')"
              @click="toggleModeMenu"
            >
              <span class="composer-mode-label">{{ modeLabel }}</span>
              <svg class="composer-mode-chevron" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <div
              v-if="modeMenuOpen"
              class="composer-mode-menu"
              role="listbox"
              :style="modeMenuStyle"
            >
              <button
                v-for="opt in modeOptions"
                :key="opt.id"
                type="button"
                class="composer-mode-menu-item"
                :class="{ active: chatComposerMode === opt.id }"
                role="option"
                :aria-selected="chatComposerMode === opt.id"
                @click="selectComposerMode(opt.id)"
              >
                <span class="composer-mode-menu-item-text">
                  <span class="composer-mode-menu-item-title">{{ t(opt.labelKey) }}</span>
                  <span class="composer-mode-menu-item-desc">{{ t(opt.descKey) }}</span>
                </span>
                <svg
                  v-if="chatComposerMode === opt.id"
                  class="composer-mode-menu-check"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M3.5 8.2L6.4 11.1L12.5 5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <button
            v-if="props.showModelPicker"
            type="button"
            class="composer-mode-btn composer-model-btn"
            :title="props.modelButtonLabel || '模型'"
            @click="props.onModelButtonClick?.()"
          >
            <span class="composer-mode-label composer-model-label">{{
              props.modelButtonLabel || ''
            }}</span>
            <svg class="composer-mode-chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="composer-icon-btn scope-btn"
            :class="{ active: scopeActive }"
            title="选择页面元素"
            @click="onScopeToggle"
          >
            <ChatScopeSvg class="scope-btn-icon" />
          </button>
          <button
            type="button"
            class="composer-icon-btn attach-btn"
            title="添加附件"
            @click="onAttachFileClick"
          >
            <PaperclipSvg class="attach-btn-icon" />
          </button>
          <button
            type="button"
            class="composer-icon-btn workspace-btn"
            title="工作区文件"
            @click="props.onWorkspaceClick"
          >
            <ChatFolderSvg class="workspace-btn-icon" />
          </button>
          <input
            ref="attachFileInputEl"
            type="file"
            class="composer-file-input"
            multiple
            tabindex="-1"
            aria-hidden="true"
            @change="onAttachFileChange"
          />
        </div>

        <div class="right-controls">
          <ContextUsageButton :conversation-id="props.conversationId" />
          <button
            v-if="loading"
            class="send-btn"
            :class="{ stop: !canEnqueue }"
            @click="onLoadingControlClick"
            :title="canEnqueue ? placeholder : '停止任务'"
          >
            <ChatSendUpSvg v-if="canEnqueue" />
            <ChatStopSvg v-else />
          </button>
          <!-- 不用 native disabled：Chrome 会对 disabled 按钮吞掉 contextmenu -->
          <div
            v-else
            ref="sendBtnWrapEl"
            class="send-btn-wrap"
          >
            <button
              type="button"
              class="send-btn"
              :class="{ 'is-disabled': !canSend }"
              :aria-disabled="!canSend"
              :title="canSend ? '发送' : '输入内容后可发送'"
              @click="onSendBtnClick"
            >
              <ChatSendUpSvg />
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="sendCtxMenuOpen && scheduleMenuEnabled"
        class="send-ctx-menu"
        :style="sendCtxMenuStyle"
        role="menu"
      >
        <button
          type="button"
          class="send-ctx-menu-item"
          role="menuitem"
          :disabled="!canSend"
          :class="{ disabled: !canSend }"
          @pointerdown.stop.prevent="onScheduleMenuClick"
        >
          {{ t("chat.scheduled.menuItem") }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="less">
.composer-shell-wrap {
  position: relative;
  overflow: visible;

  &--inline {
    min-width: 200px;
    width: 100%;
  }
}

.composer-shell {
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  padding: 15px 15px 10px;
  box-sizing: border-box;
}

.composer-shell-wrap--inline .composer-shell {
  /* 内联编辑：气泡外层不再叠加 padding，这里直接给到“可见 10px” */
  padding: 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-sizing: border-box;
}

.composer-input-mix {
  position: relative;
  min-width: 0;
  --composer-input-font-size: 15px;
  --composer-input-line-height: 1.4;
  --composer-chip-font-size: 13px;
  --composer-chip-height: 22px;
}

.composer-input-mix .chat-input {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  min-height: 42px;
  max-height: 300px;
  overflow-y: auto;
  box-sizing: border-box;
  border: none;
  outline: none;
  background: transparent;
  /* 与 ChatPanel 底部输入框一致：浅色背景上用深色字 */
  color: var(--stay-black, var(--stay-border));
  caret-color: var(--stay-black, var(--stay-border));
  font-size: var(--composer-input-font-size);
  line-height: var(--composer-input-line-height);
  white-space: pre-wrap;
  word-break: break-word;
  resize: none;

  &:focus {
    outline: none;
  }
}

.composer-input-mix .chat-input--mixed {
  overflow-wrap: anywhere;
  cursor: text;
  position: relative;

  &:empty::before,
  &[data-empty="true"]::before {
    content: attr(data-placeholder);
    color: #8a8a8a;
    pointer-events: none;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  :deep(.composer-chip) {
    display: inline-flex;
    vertical-align: middle;
    align-items: center;
    flex-shrink: 0;
    max-width: calc(100% - 4px);
    margin: 1px 2px 1px 0;
    padding: 0 6px 0 4px;
    border-radius: 6px;
    border-width: 1px;
    border-style: solid;
    font-size: var(--composer-chip-font-size);
    line-height: 1;
    height: var(--composer-chip-height);
    min-height: var(--composer-chip-height);
    max-height: var(--composer-chip-height);
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
  }

  :deep(.composer-chip.copy-selection-chip) {
    border-color: var(--stay-border, #444);
    background: var(--stay-backgroundTertiary, #202020);
    color: var(--stay-black);
    cursor: pointer;
    height: auto;
    min-height: 22px;
    max-height: none;
    padding: 2px 6px 2px 4px;
  }

  :deep(.composer-chip.tab-mention-chip) {
    border-color: var(--stay-black);
    cursor: default;
  }

  :deep(.composer-chip.slash-command-chip) {
    border-color: var(--stay-commandChipBorder, #3674f0);
    background: var(--stay-commandChipBg, #ebf1fe);
    color: var(--stay-commandChipText, #3674f0);
    cursor: default;
  }

  :deep(.composer-chip.quote-msg-chip) {
    cursor: pointer;
  }

  :deep(.composer-chip .copy-selection-chip-leading),
  :deep(.composer-chip .slash-command-chip-leading) {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin-right: 4px;
    min-height: 0;
  }

  :deep(.composer-chip .copy-selection-chip-text),
  :deep(.composer-chip .slash-command-chip-text) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
    font-size: var(--composer-chip-font-size);
    line-height: 1.25;
    min-height: 0;
    color: var(--stay-black);
  }

  :deep(.composer-chip .slash-command-chip-text) {
    color: var(--stay-commandChipText, #3674f0);
  }

  :deep(.composer-chip .copy-selection-chip-dismiss),
  :deep(.composer-chip .slash-command-chip-dismiss) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    min-width: 12px;
    min-height: 12px;
    margin-right: 2px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }

  :deep(.composer-chip .copy-selection-chip-dismiss) {
    color: var(--stay-secondaryFont, #999);
  }

  :deep(.composer-chip .slash-command-chip-dismiss) {
    color: var(--stay-commandChipText, #3674f0);
    opacity: 0.85;

    &:hover {
      opacity: 1;
    }
  }

  :deep(.composer-chip .copy-selection-chip-favicon) {
    width: 12px;
    height: 12px;
    max-width: 12px;
    max-height: 12px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
  }
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 0;
}

.left-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.composer-mode-wrap {
  position: relative;
  flex-shrink: 0;
}

.composer-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 27px;
  height: auto;
  margin: 0;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  background: rgba(47, 49, 52, 0.06);
  color: var(--stay-black, #2f3134);
  cursor: pointer;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  line-height: 1.35;
  box-sizing: border-box;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(47, 49, 52, 0.1);
  }

  &--ask {
    background: rgb(220, 242, 220);

    &:hover {
      background: rgb(200, 232, 200);
    }
  }
}

.composer-model-btn {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 108px;
  overflow: hidden;

  .composer-model-label {
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-mode-chevron {
    flex-shrink: 0;
  }
}

.composer-mode-label {
  display: inline-block;
  line-height: 1.35;
  white-space: nowrap;
}

.composer-mode-chevron {
  width: 10px;
  height: 10px;
  display: block;
  flex-shrink: 0;
  opacity: 0.7;
}

.composer-mode-menu {
  z-index: 10001;
  min-width: 220px;
  padding: 4px;
  border: 1px solid var(--stay-border, #37372f);
  border-radius: 10px;
  background: var(--stay-background, #f8f8f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.composer-mode-menu-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--stay-black, #2f3134);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: var(--stay-backgroundTertiary, #eeeeee);
  }
}

.composer-mode-menu-item-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.composer-mode-menu-item-title {
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 600;
  line-height: 1.35;
  color: var(--stay-black, #2f3134);
  white-space: nowrap;
}

.composer-mode-menu-item-desc {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.35;
  color: var(--stay-textSecondary, rgba(47, 49, 52, 0.62));
  white-space: nowrap;
}

.composer-mode-menu-check {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 1px;
  color: var(--stay-black, #2f3134);
}

.composer-file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.composer-icon-btn {
  width: 27px;
  height: 27px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--stay-black);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease, opacity 0.15s ease;

  &:hover {
    opacity: 0.72;
  }

  :deep(.scope-btn-icon),
  :deep(.attach-btn-icon),
  :deep(.workspace-btn-icon) {
    width: 16px;
    height: 16px;
    display: block;
  }

  :deep(.workspace-btn-icon) {
    width: 18px;
    height: 18px;
  }

  :deep(.scope-btn-icon path),
  :deep(.attach-btn-icon path) {
    fill: currentColor;
  }

  :deep(.workspace-btn-icon path) {
    fill: none !important;
    stroke: currentColor;
    stroke-width: 1px;
    stroke-linejoin: round;
  }

  &.scope-btn.active {
    color: rgb(54, 116, 240);
  }
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.send-btn-wrap {
  display: inline-flex;
  line-height: 0;
}

.send-btn {
  width: 27px;
  height: 27px;
  border: none;
  border-radius: 999px;
  background: var(--stay-primary);
  color: var(--stay-white);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &.stop {
    background: var(--stay-primary);
  }

  &:disabled,
  &.is-disabled {
    background: var(--stay-border);
    color: var(--stay-white);
    opacity: 1;
    cursor: not-allowed;
  }

  :deep(svg) {
    width: 12px;
    height: 12px;
    display: block;
    pointer-events: none;
  }

  &.stop :deep(svg) {
    width: 10px;
    height: 10px;
  }
}
</style>

<style lang="less">
.send-ctx-menu {
  position: fixed;
  z-index: 10060;
  min-width: 160px;
  padding: 4px;
  border-radius: 8px;
  background: var(--stay-backgroundSecondary, #1e1e1e);
  border: 1px solid var(--stay-border, #333);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
}

.send-ctx-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--stay-black);
  font-size: 13px;
  line-height: 1.3;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--stay-border);
  }

  &:disabled,
  &.disabled {
    color: var(--stay-secondaryFont, #8a8a8a);
    cursor: not-allowed;
    opacity: 0.55;
  }
}
</style>
