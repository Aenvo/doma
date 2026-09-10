<template>
  <div class="quick-messages-panel" aria-label="quick messages">
    <div class="quick-messages-list">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="quick-msg chat-msg-like"
        :class="{
          'quick-msg--dragging': dragFromIndex === index,
          'quick-msg--drag-over': dragOverIndex === index && dragFromIndex !== index,
        }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index, $event)"
        @dragleave="onDragLeave(index)"
        @drop.prevent="onDrop(index)"
        @dragend="onDragEnd"
        @mousemove="onItemMouseMove(item, $event)"
        @mouseleave="onItemMouseLeave(item.id)"
        @click="onItemClick(item, $event)"
      >
        <div class="quick-msg-body">
          <template v-if="slashParts(item).hasSlash">
            <span
              class="qm-seg qm-left"
              :class="{ 'qm-seg--active': hoverSideById[item.id] === 'left' }"
              data-qm-side="left"
            >{{ slashParts(item).left }}</span>
            <span class="qm-slash" data-qm-side="slash">/</span>
            <span
              class="qm-seg qm-right"
              :class="{ 'qm-seg--active': hoverSideById[item.id] === 'right' }"
              data-qm-side="right"
            >{{ slashParts(item).right }}</span>
          </template>
          <span v-else class="qm-plain">{{ labelOf(item) }}</span>
        </div>
        <button
          type="button"
          class="quick-msg-delete"
          :title="t('chat.quickMessages.delete')"
          @click.stop="onDelete(item.id)"
        >
          <ChatTrashSvg class="quick-msg-delete-icon" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="quick-messages-add-wrap">
      <button
        v-if="!adding"
        type="button"
        class="quick-messages-add-btn"
        @click="adding = true"
      >
        {{ t("chat.quickMessages.add") }}
      </button>
      <div v-else class="quick-messages-add-form">
        <input
          ref="addInputRef"
          v-model="draftText"
          type="text"
          class="quick-messages-add-input"
          :placeholder="t('chat.quickMessages.addPlaceholder')"
          @keydown.enter.prevent="confirmAdd"
          @keydown.esc.prevent="cancelAdd"
        />
        <button type="button" class="quick-messages-add-confirm" @click="confirmAdd">
          {{ t("chat.quickMessages.addConfirm") }}
        </button>
        <button type="button" class="quick-messages-add-cancel" @click="cancelAdd">
          {{ t("chat.quickMessages.addCancel") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ChatTrashSvg from "@/assets/images/chat-trash.svg";
import {
  loadQuickMessages,
  newCustomQuickMessageId,
  resolveQuickMessageLabel,
  resolveQuickMessageSendText,
  saveQuickMessages,
  splitQuickMessageSlash,
  type QuickMessageItem,
} from "@/services/chat/quickMessagesStore";

const emit = defineEmits<{
  (e: "send", text: string): void;
}>();

const { t, locale } = useI18n();

const items = ref<QuickMessageItem[]>([]);
const hoverSideById = reactive<Record<string, "left" | "right" | undefined>>({});
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const adding = ref(false);
const draftText = ref("");
const addInputRef = ref<HTMLInputElement | null>(null);

function labelOf(item: QuickMessageItem): string {
  return resolveQuickMessageLabel(item, t);
}

function slashParts(item: QuickMessageItem) {
  return splitQuickMessageSlash(labelOf(item));
}

async function persist() {
  try {
    await saveQuickMessages(items.value);
  } catch (e) {
    console.warn("[quickMessages] persist failed:", e);
  }
}

async function reload() {
  items.value = await loadQuickMessages();
}

onMounted(() => {
  void reload();
});

watch(locale, () => {
  // defaults re-resolve via t(); no storage rewrite needed
});

watch(adding, async (v) => {
  if (v) {
    await nextTick();
    addInputRef.value?.focus();
  }
});

function onItemMouseMove(item: QuickMessageItem, ev: MouseEvent) {
  const parts = slashParts(item);
  if (!parts.hasSlash) {
    hoverSideById[item.id] = undefined;
    return;
  }
  const el = ev.target as HTMLElement | null;
  const sideEl = el?.closest?.("[data-qm-side]") as HTMLElement | null;
  const side = sideEl?.dataset?.qmSide;
  if (side === "left") hoverSideById[item.id] = "left";
  else if (side === "right") hoverSideById[item.id] = "right";
  else if (side === "slash") {
    // Prefer nearer side by x within the card body
    const body = (ev.currentTarget as HTMLElement).querySelector(".quick-msg-body");
    if (body) {
      const rect = body.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      hoverSideById[item.id] = ev.clientX < mid ? "left" : "right";
    }
  }
}

function onItemMouseLeave(id: string) {
  hoverSideById[id] = undefined;
}

function onItemClick(item: QuickMessageItem, ev: MouseEvent) {
  if ((ev.target as HTMLElement)?.closest?.(".quick-msg-delete")) return;
  const label = labelOf(item);
  const parts = slashParts(item);
  let side: "left" | "right" | "whole" = "whole";
  if (parts.hasSlash) {
    const el = ev.target as HTMLElement | null;
    const sideEl = el?.closest?.("[data-qm-side]") as HTMLElement | null;
    const s = sideEl?.dataset?.qmSide;
    if (s === "left") side = "left";
    else if (s === "right") side = "right";
    else side = hoverSideById[item.id] || "left";
  }
  const text = resolveQuickMessageSendText(label, side).trim();
  if (!text) return;
  emit("send", text);
}

async function onDelete(id: string) {
  items.value = items.value.filter((x) => x.id !== id);
  await persist();
}

function onDragStart(index: number, ev: DragEvent) {
  dragFromIndex.value = index;
  ev.dataTransfer?.setData("text/plain", String(index));
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
}

function onDragOver(index: number, _ev: DragEvent) {
  dragOverIndex.value = index;
}

function onDragLeave(index: number) {
  if (dragOverIndex.value === index) dragOverIndex.value = null;
}

async function onDrop(toIndex: number) {
  const from = dragFromIndex.value;
  dragOverIndex.value = null;
  if (from == null || from === toIndex) return;
  const next = items.value.slice();
  const [moved] = next.splice(from, 1);
  if (!moved) return;
  next.splice(toIndex, 0, moved);
  items.value = next;
  await persist();
}

function onDragEnd() {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

async function confirmAdd() {
  const text = draftText.value.trim();
  if (!text) return;
  items.value = [
    ...items.value,
    { id: newCustomQuickMessageId(), kind: "custom", text },
  ];
  draftText.value = "";
  adding.value = false;
  await persist();
}

function cancelAdd() {
  draftText.value = "";
  adding.value = false;
}
</script>

<style lang="less" scoped>
.quick-messages-panel {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  pointer-events: none;
  padding: 12px 0 24px;
  box-sizing: border-box;
}

.quick-messages-list,
.quick-messages-add-wrap {
  pointer-events: auto;
  padding-left: max(70px, 12px);
  padding-right: 16px;
  box-sizing: border-box;
}

.quick-messages-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-height: min(60vh, 420px);
  overflow-y: auto;
}

.quick-msg {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 90%;
  padding: 8px 28px 8px 12px;
  border-radius: 10px;
  font-size: 15px;
  line-height: 1.45;
  color: var(--stay-black);
  background: var(--stay-border);
  border: 1px solid transparent;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;

  &:hover {
    border-color: var(--stay-black);
  }

  &--dragging {
    opacity: 0.45;
  }

  &--drag-over {
    outline: 1px dashed var(--stay-black);
  }
}

.quick-msg-body {
  word-break: break-word;
}

.qm-seg {
  transition: color 0.12s ease, opacity 0.12s ease;

  &--active {
    color: var(--stay-black);
  }
}

.quick-msg:hover .qm-seg:not(.qm-seg--active) {
  opacity: 0.45;
}

.qm-slash {
  opacity: 0.55;
  margin: 0 1px;
}

.quick-msg-delete {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--stay-black);
  cursor: pointer;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.06);
  }
}

.quick-msg:hover .quick-msg-delete {
  display: inline-flex;
}

.quick-msg-delete-icon {
  width: 13px;
  height: 13px;
  display: block;
}

.quick-messages-add-wrap {
  margin-top: 14px;
}

.quick-messages-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--stay-border);
  color: var(--stay-secondaryFont, #8a8a8a);
  font-size: 15px;
  line-height: 1.45;
  cursor: pointer;
  box-sizing: border-box;

  &::before {
    content: "+";
    font-size: 16px;
    line-height: 1;
    color: inherit;
  }

  &:hover {
    border-color: var(--stay-black);
    color: var(--stay-black);
  }
}

.quick-messages-add-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-width: 90%;
}

.quick-messages-add-input {
  flex: 1 1 160px;
  min-width: 120px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: #fff;
  color: var(--stay-black);
  font-size: 13px;
  box-sizing: border-box;
}

.quick-messages-add-confirm,
.quick-messages-add-cancel {
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: var(--stay-border);
  color: var(--stay-black);
  font-size: 13px;
  cursor: pointer;
}

.quick-messages-add-cancel {
  background: transparent;
}
</style>
