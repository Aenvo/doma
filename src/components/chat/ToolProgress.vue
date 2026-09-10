<template>
  <div class="tool-progress" :class="payload.status">
    <div class="tp-indicator">
      <span v-if="payload.status === 'running'" class="tp-spinner"></span>
      <svg
        v-else-if="payload.status === 'completed'"
        class="tp-icon tp-icon-success"
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
        class="tp-icon tp-icon-error"
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
    <div class="tp-content">
      <span class="tp-message">{{ displayMessage }}</span>
      <span v-if="payload.status === 'error' && payload.errorMessage" class="tp-error">
        {{ payload.errorMessage }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProgressPayload } from './chatTypes';

const props = defineProps<{
  payload: ProgressPayload;
}>();

const { t } = useI18n();

const displayMessage = computed(() => {
  const msg = props.payload.message?.trim();
  if (msg) return msg;
  switch (props.payload.status) {
    case 'running':
      return t('chat.progress.running');
    case 'completed':
      return t('chat.progress.completed');
    case 'error':
      return t('chat.progress.error');
    default:
      return '';
  }
});
</script>

<style scoped lang="less">
.tool-progress {
  display: flex;
  align-items: center;
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

.tp-indicator {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tp-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: var(--stay-black, #e0e0e0);
  border-radius: 50%;
  animation: tp-pulse 1.2s ease-in-out infinite;
}

.tp-icon-success {
  color: var(--stay-primary, #07c160);
}

.tp-icon-error {
  color: #e74c3c;
}

.tp-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tp-message {
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #8a8a8a);
  line-height: 1.4;
  word-break: break-word;
}

.tp-error {
  font-size: var(--stay-text-footnote, 12px);
  color: #e74c3c;
  line-height: 1.3;
}

@keyframes tp-pulse {
  0%,
  100% {
    transform: scale(0.85);
  }
  50% {
    transform: scale(1);
  }
}
</style>
