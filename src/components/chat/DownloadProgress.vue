<template>
  <div class="download-progress" :class="payload.status">
    <div class="dp-header">
      <img
        v-if="payload.poster"
        :src="payload.poster"
        class="dp-poster"
        @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
      />
      <div v-else class="dp-poster-placeholder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>
      <div class="dp-info">
        <span class="dp-title">{{ truncate(payload.title, 40) }}</span>
        <span class="dp-status-text">{{ statusText }}</span>
      </div>
    </div>
    <div class="dp-bar-wrapper">
      <div class="dp-bar">
        <div class="dp-bar-fill" :style="{ width: payload.percent + '%' }"></div>
      </div>
      <div class="dp-meta">
        <span v-if="payload.speed" class="dp-speed">{{ payload.speed }}</span>
        <span class="dp-percent">{{ payload.percent }}%</span>
      </div>
    </div>
    <div v-if="payload.status === 'error' && payload.errorMessage" class="dp-error">
      {{ payload.errorMessage }}
    </div>
    <div class="dp-actions" v-if="payload.status === 'downloading'">
      <button class="dp-action-btn pause-btn" @click="emit('action', 'pause_download', { videoId: payload.videoId })">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DownloadProgressPayload } from './chatTypes';

const props = defineProps<{
  payload: DownloadProgressPayload;
}>();

const emit = defineEmits<{
  (e: 'action', action: string, data: Record<string, unknown>): void;
}>();

const statusText = computed(() => {
  switch (props.payload.status) {
    case 'downloading': return '正在下载...';
    case 'paused': return '已暂停';
    case 'completed': return '下载完成';
    case 'error': return '下载失败';
    default: return '';
  }
});

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}
</script>

<style scoped lang="less">
.download-progress {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--stay-border, #333);
  border-radius: 10px;

  &.downloading {
    border-color: var(--s-main, #07c160);
  }
  &.completed {
    border-color: var(--s-main, #07c160);
    background: rgba(7, 193, 96, 0.05);
  }
  &.error {
    border-color: #e74c3c;
    background: rgba(231, 76, 60, 0.05);
  }
}

.dp-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dp-poster {
  width: 48px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.dp-poster-placeholder {
  width: 48px;
  height: 36px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--stay-secondaryFont, #666);
}

.dp-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dp-title {
  font-size: 0.8rem;
  color: var(--stay-black, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dp-status-text {
  font-size: 0.65rem;
  color: var(--stay-secondaryFont, #888);
}

.dp-bar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dp-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.dp-bar-fill {
  height: 100%;
  background: var(--s-main, #07c160);
  border-radius: 2px;
  transition: width 0.3s ease;

  .error & {
    background: #e74c3c;
  }
}

.dp-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: var(--stay-secondaryFont, #888);
}

.dp-error {
  margin-top: 6px;
  font-size: 0.7rem;
  color: #e74c3c;
}

.dp-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

.dp-action-btn {
  background: none;
  border: 1px solid var(--stay-border, #444);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--stay-black);
  display: flex;
  align-items: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}
</style>
