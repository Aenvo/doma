<template>
  <div class="tool-thinking" :class="payload.status">
    <div class="tt-indicator">
      <span v-if="payload.status === 'running'" class="tt-spinner"></span>
      <svg
        v-else-if="payload.status === 'completed'"
        class="tt-icon tt-icon-success"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <svg
        v-else
        class="tt-icon tt-icon-error"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>
    <div class="tt-content">
      <span v-if="payload.title" class="tt-title">{{ payload.title }}</span>
      <div ref="bodyEl" class="tt-body">
        <template v-if="lines.length > 0">
          <div
            v-for="(line, i) in lines"
            :key="i"
            class="tt-line-row"
            :class="{ 'tt-line-row-last': i === lines.length - 1 }"
          >
            <span class="tt-line">{{ line }}</span>
            <button
              v-if="showStopOnRow(i)"
              type="button"
              class="tt-stop-btn"
              @click="onStop"
            >
              {{ t('chat.thinking.stop') }}
            </button>
          </div>
        </template>
        <div v-else class="tt-line-row tt-line-row-last">
          <span class="tt-placeholder">{{ placeholderText }}</span>
          <button
            v-if="isRunning"
            type="button"
            class="tt-stop-btn"
            @click="onStop"
          >
            {{ t('chat.thinking.stop') }}
          </button>
        </div>
        <div ref="bottomAnchor" class="tt-scroll-anchor" aria-hidden="true"></div>
      </div>
      <span v-if="payload.status === 'error' && payload.errorMessage" class="tt-error">
        {{ payload.errorMessage }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ThinkingPayload } from './chatTypes';

const props = defineProps<{
  payload: ThinkingPayload;
}>();

const emit = defineEmits<{
  (e: 'action', action: string, data: Record<string, unknown>): void;
}>();

const { t } = useI18n();
const bodyEl = ref<HTMLElement | null>(null);
const bottomAnchor = ref<HTMLElement | null>(null);

const isRunning = computed(() => props.payload.status === 'running');

const lines = computed(() => {
  const raw = props.payload.content ?? '';
  if (!raw) return [];
  return raw.split('\n');
});

const placeholderText = computed(() => {
  switch (props.payload.status) {
    case 'running':
      return t('chat.thinking.running');
    case 'completed':
      return t('chat.thinking.completed');
    case 'error':
      return t('chat.thinking.error');
    default:
      return '';
  }
});

function showStopOnRow(index: number): boolean {
  return isRunning.value && index === lines.value.length - 1;
}

function onStop() {
  emit('action', 'stop_thinking', { thinkId: props.payload.thinkId });
}

function scrollToBottom() {
  void nextTick().then(() => {
    requestAnimationFrame(() => {
      const anchor = bottomAnchor.value;
      if (anchor) {
        anchor.scrollIntoView({ block: 'end' });
      }
      const el = bodyEl.value;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  });
}

watch(() => props.payload.content, scrollToBottom, { flush: 'post' });
watch(() => lines.value.length, scrollToBottom, { flush: 'post' });

onMounted(scrollToBottom);
</script>

<style scoped lang="less">
.tool-thinking {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--stay-border, #333);
  border-radius: 10px;

  &.completed {
    background: rgba(0, 229, 255, 0.05);
  }

  &.error {
    background: rgba(231, 76, 60, 0.05);
  }
}

.tt-indicator {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tt-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: var(--stay-black, #e0e0e0);
  border-radius: 50%;
  animation: tt-pulse 1.2s ease-in-out infinite;
}

.tt-icon-success {
  color: var(--stay-primary, #07c160);
}

.tt-icon-error {
  color: #e74c3c;
}

.tt-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tt-title {
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.3;
}

.tt-body {
  max-height: calc(1.4em * 5);
  max-height: 5lh;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.4;
  word-break: break-word;
}

.tt-line-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tt-line-row-last {
  flex-wrap: wrap;
}

.tt-line {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  color: var(--stay-secondaryFont, #8a8a8a);
}

.tt-placeholder {
  flex: 1;
  min-width: 0;
  color: var(--stay-secondaryFont, #8a8a8a);
}

.tt-stop-btn {
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid var(--stay-border, #333);
  border-radius: 6px;
  background: transparent;
  color: var(--stay-secondaryFont, #888);
  font-size: var(--stay-text-subfootnote, 10px);
  line-height: 1.4;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:hover {
    color: var(--stay-black, #e0e0e0);
    border-color: var(--stay-black, #e0e0e0);
    background: rgba(255, 255, 255, 0.04);
  }
}

.tt-scroll-anchor {
  height: 0;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
}

.tt-error {
  font-size: var(--stay-text-footnote, 12px);
  color: #e74c3c;
  line-height: 1.3;
}

@keyframes tt-pulse {
  0%,
  100% {
    transform: scale(0.85);
  }
  50% {
    transform: scale(1);
  }
}
</style>
