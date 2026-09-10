import { ref, computed, type ComputedRef } from "vue";

export interface EnqueueItem {
  enqueueId: string;
  conversationId: string;
  text: string;
  timestamp: number;
}

const enqueueItems = ref<EnqueueItem[]>([]);

function newEnqueueId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `enqueue-${crypto.randomUUID()}`
    : `enqueue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getEnqueueItemsRef() {
  return enqueueItems;
}

export function enqueueMessage(conversationId: string, text: string): EnqueueItem {
  const trimmed = text.trim();
  const item: EnqueueItem = {
    enqueueId: newEnqueueId(),
    conversationId,
    text: trimmed,
    timestamp: Date.now(),
  };
  enqueueItems.value = [...enqueueItems.value, item];
  return item;
}

export function removeEnqueueItem(enqueueId: string): void {
  enqueueItems.value = enqueueItems.value.filter((i) => i.enqueueId !== enqueueId);
}

export function getEnqueueItemsForConversation(conversationId: string): EnqueueItem[] {
  return enqueueItems.value
    .filter((i) => i.conversationId === conversationId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function shiftEnqueueForConversation(conversationId: string): EnqueueItem | undefined {
  const next = getEnqueueItemsForConversation(conversationId)[0];
  if (!next) return undefined;
  removeEnqueueItem(next.enqueueId);
  return next;
}

export function clearEnqueueForConversation(conversationId: string): void {
  enqueueItems.value = enqueueItems.value.filter((i) => i.conversationId !== conversationId);
}

export function useEnqueueForConversation(conversationId: ComputedRef<string | undefined>) {
  return computed(() => {
    const id = conversationId.value;
    if (!id) return [] as EnqueueItem[];
    return getEnqueueItemsForConversation(id);
  });
}
