<template>
  <div class="file-card" :class="cardType">
    <div class="fc-icon">
      <svg v-if="cardType === 'downloaded'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
    </div>
    <div class="fc-info">
      <span class="fc-title">{{ displayTitle }}</span>
      <span class="fc-meta">
        <template v-if="isDownloaded">
          <span v-if="downloadPayload.fileSize">{{ downloadPayload.fileSize }}</span>
          <span class="fc-success">下载完成</span>
        </template>
        <template v-else>
          <span v-if="filePayload.fileSize">{{ filePayload.fileSize }}</span>
          <span v-if="filePayload.fileType">{{ filePayload.fileType }}</span>
        </template>
      </span>
    </div>
    <div class="fc-actions">
      <button v-if="actionUrl" class="fc-open-btn" @click="openFile" title="打开">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FileDownloadedPayload, FileCardPayload } from './chatTypes';

const props = defineProps<{
  uiType: string;
  payload: FileDownloadedPayload | FileCardPayload;
}>();

const emit = defineEmits<{
  (e: 'action', action: string, data: Record<string, unknown>): void;
}>();

const isDownloaded = computed(() => props.uiType === 'FILE_DOWNLOADED');

const downloadPayload = computed(() => props.payload as FileDownloadedPayload);
const filePayload = computed(() => props.payload as FileCardPayload);

const cardType = computed(() => isDownloaded.value ? 'downloaded' : 'file');

const displayTitle = computed(() => {
  if (isDownloaded.value) return downloadPayload.value.title || '已下载文件';
  return filePayload.value.fileName || '文件';
});

const actionUrl = computed(() => {
  if (isDownloaded.value) return downloadPayload.value.downloadUrl || downloadPayload.value.filePath;
  return filePayload.value.url;
});

function openFile() {
  if (actionUrl.value) {
    emit('action', 'open_file', { url: actionUrl.value });
  }
}
</script>

<style scoped lang="less">
.file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--stay-border, #333);
  border-radius: 10px;
  width: 100%;

  &.downloaded {
    border-color: var(--s-main, #07c160);
    background: rgba(7, 193, 96, 0.05);
  }
}

.fc-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--s-main, #07c160);

  .file & {
    color: var(--stay-secondaryFont, #888);
  }
}

.fc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fc-title {
  font-size: 0.8rem;
  color: var(--stay-black, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fc-meta {
  display: flex;
  gap: 8px;
  font-size: 0.65rem;
  color: var(--stay-secondaryFont, #888);
}

.fc-success {
  color: var(--s-main, #07c160);
}

.fc-actions {
  flex-shrink: 0;
}

.fc-open-btn {
  background: none;
  border: 1px solid var(--stay-border, #444);
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  color: var(--stay-black);
  display: flex;
  align-items: center;
  transition: all 0.2s;

  &:hover {
    border-color: var(--s-main, #07c160);
    color: var(--s-main, #07c160);
  }
}
</style>
