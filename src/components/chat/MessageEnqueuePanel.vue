<template>
  <div v-if="items.length" class="message-enqueue-panel">
    <div class="enqueue-inner">
      <div class="enqueue-header">{{ t('chat.enqueue.queued', { count: items.length }) }}</div>
      <div
        v-for="item in items"
        :key="item.enqueueId"
        class="enqueue-item"
      >
        <span class="enqueue-text" :title="item.text">{{ previewText(item.text) }}</span>
        <div class="enqueue-actions">
          <button
            type="button"
            class="enqueue-action-btn"
            :title="t('chat.enqueue.send')"
            :aria-label="t('chat.enqueue.send')"
            @click.stop="onSend(item)"
          >
            <ChatSendUpSvg class="enqueue-action-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="enqueue-action-btn"
            :title="t('chat.enqueue.remove')"
            :aria-label="t('chat.enqueue.remove')"
            @click.stop="onRemove(item)"
          >
            <ChatTrashSvg class="enqueue-action-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ChatSendUpSvg from "@/assets/images/chat-send-up.svg";
import ChatTrashSvg from "@/assets/images/chat-trash.svg";
import {
  type EnqueueItem,
  getEnqueueItemsForConversation,
  removeEnqueueItem,
  getEnqueueItemsRef,
} from "@/services/chat/enqueueStore";

const props = defineProps<{
  conversationId?: string;
}>();

const emit = defineEmits<{
  (e: "send", item: EnqueueItem): void;
  (e: "remove", item: EnqueueItem): void;
}>();

const { t } = useI18n();
const enqueueItemsRef = getEnqueueItemsRef();

const items = computed(() => {
  void enqueueItemsRef.value;
  const id = props.conversationId;
  if (!id) return [];
  return getEnqueueItemsForConversation(id);
});

function previewText(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= 100) return line;
  return `${line.slice(0, 100)}…`;
}

function onSend(item: EnqueueItem) {
  removeEnqueueItem(item.enqueueId);
  emit("send", item);
}

function onRemove(item: EnqueueItem) {
  removeEnqueueItem(item.enqueueId);
  emit("remove", item);
}
</script>

<style scoped lang="less">
.message-enqueue-panel {
  border-bottom: 1px solid var(--stay-border);
  background: var(--stay-background);
  box-sizing: border-box;
}

.enqueue-inner {
  margin: 0 10px;
  padding: 8px 0 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}

.enqueue-header {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--stay-secondaryFont);
}

.enqueue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 12px;
  border: none;
  background: var(--stay-backgroundTertiary);
  box-sizing: border-box;
}

.enqueue-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--stay-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.enqueue-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.enqueue-action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--stay-black);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;

  &:hover {
    background: var(--stay-border);
  }
}

.enqueue-action-icon {
  width: 14px;
  height: 14px;
  display: block;
}
</style>
