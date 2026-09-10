<template>
  <div class="custom-ui-wrapper">
    <VideoSelector
      v-if="customUi.type === 'VIDEO_SELECTOR'"
      :payload="customUi.payload as VideoSelectorPayload"
      @action="onAction"
    />
    <DownloadProgress
      v-else-if="customUi.type === 'DOWNLOAD_PROGRESS'"
      :payload="customUi.payload as DownloadProgressPayload"
      @action="onAction"
    />
    <FileCard
      v-else-if="customUi.type === 'FILE_DOWNLOADED' || customUi.type === 'FILE_CARD'"
      :uiType="customUi.type"
      :payload="customUi.payload as (FileDownloadedPayload | FileCardPayload)"
      @action="onAction"
    />
    <ToolProgress
      v-else-if="customUi.type === 'PROGRESS'"
      :payload="customUi.payload as ProgressPayload"
    />
    <!-- [disabled 2026-06-18] THINKING — see disabledFeatures.record.md
    <ToolThinking
      v-else-if="customUi.type === 'THINKING'"
      :payload="customUi.payload as ThinkingPayload"
      @action="onAction"
    />
    -->
    <div v-else-if="customUi.type === 'ERROR_CARD'" class="error-card">
      <div class="error-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <div class="error-content">
        <span class="error-title">{{ (customUi.payload as ErrorCardPayload).title }}</span>
        <span class="error-message">{{ (customUi.payload as ErrorCardPayload).message }}</span>
      </div>
      <button
        v-if="(customUi.payload as ErrorCardPayload).retryAction"
        class="error-retry-btn"
        @click="onAction('retry', { action: (customUi.payload as ErrorCardPayload).retryAction })"
      >
        重试
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  CustomUI,
  VideoSelectorPayload,
  DownloadProgressPayload,
  FileDownloadedPayload,
  FileCardPayload,
  ErrorCardPayload,
  ProgressPayload,
  // ThinkingPayload, // [disabled 2026-06-18] see disabledFeatures.record.md
} from './chatTypes';
import VideoSelector from './VideoSelector.vue';
import DownloadProgress from './DownloadProgress.vue';
import FileCard from './FileCard.vue';
import ToolProgress from './ToolProgress.vue';
// import ToolThinking from './ToolThinking.vue'; // [disabled 2026-06-18]

defineProps<{
  customUi: CustomUI;
  messageId: string;
}>();

const emit = defineEmits<{
  (e: 'action', action: string, data: Record<string, unknown>): void;
}>();

function onAction(action: string, data: Record<string, unknown>) {
  emit('action', action, data);
}
</script>

<style scoped lang="less">
.custom-ui-wrapper {
  width: 100%;
}

.error-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(231, 76, 60, 0.05);
  border: 1px solid #e74c3c;
  border-radius: 10px;
}

.error-icon {
  flex-shrink: 0;
  color: #e74c3c;
}

.error-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-title {
  font-size: 0.8rem;
  color: #e74c3c;
  font-weight: 500;
}

.error-message {
  font-size: 0.7rem;
  color: var(--stay-secondaryFont, #888);
}

.error-retry-btn {
  background: none;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(231, 76, 60, 0.1);
  }
}
</style>
