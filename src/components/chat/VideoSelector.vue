<template>
  <div class="video-selector">
    <div v-if="!currentVideo" class="no-videos">{{ t('chat.video.noVideos') }}</div>

    <div v-else class="pending-card" @click="selectVideo(currentIndex)">
      <div class="pending-main">
        <div class="poster">
          <img
            v-if="currentVideo.poster"
            :src="currentVideo.poster"
            :alt="currentVideo.title"
            class="poster-img"
            @error="onImgError"
          />
          <div v-else class="poster-placeholder">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>

        <div class="info">
          <div class="title" :title="currentVideo.title">{{ currentVideo.title || t('chat.video.unknownTitle') }}</div>
          <div class="meta">
            <span v-if="currentVideo.hostUrl" class="host">{{ extractDomain(currentVideo.hostUrl) }}</span>
            <span v-if="payload.videos.length > 1" class="count">{{ t('chat.video.count', { count: payload.videos.length }) }}</span>
            <span v-if="currentVideo.type" class="type">{{ currentVideo.type }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="sortedQualityList.length"
        class="quality-list"
        @click.stop
      >
        <button
          v-for="(quality, qIndex) in sortedQualityList"
          :key="qualityKey(quality, qIndex)"
          type="button"
          class="quality-chip"
          :class="{ 'is-selected': isQualitySelected(qIndex) }"
          @click.stop="selectQuality(qIndex)"
        >{{ quality.qualityLabel }}</button>
      </div>

      <button class="download-cta" type="button" @click.stop="onDownload(currentIndex)">
        <img class="download-icon" :src="chatArrowDownIcon" alt="" aria-hidden="true" />
        <span class="download-label">{{ t('chat.video.download') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { VideoOption, VideoSelectorPayload } from './chatTypes';
import chatArrowDownIcon from "@/assets/images/chat-arrow-down.png";

const { t } = useI18n();

const props = defineProps<{
  payload: VideoSelectorPayload;
}>();

const emit = defineEmits<{
  (e: 'action', action: string, data: Record<string, unknown>): void;
}>();

function selectVideo(index: number) {
  emit('action', 'select_video', { index, video: props.payload.videos[index] });
}

function onDownload(index: number) {
  const video = props.payload.videos[index];
  const quality = selectedQuality.value;
  const downloadVideo = quality
    ? {
        ...video,
        downloadUrl: quality.downloadUrl,
        audioUrl: quality.audioUrl ?? "",
        qualityLabel: quality.qualityLabel,
      }
    : video;
  emit('action', 'download_video', { index, video: downloadVideo });
}

const currentIndex = computed(() => {
  const idx = props.payload.selectedIndex;
  if (typeof idx === "number" && Number.isFinite(idx) && idx >= 0 && idx < props.payload.videos.length) {
    return idx;
  }
  return 0;
});

const currentVideo = computed(() => props.payload.videos[currentIndex.value]);

const qualityList = computed(() => currentVideo.value?.qualityList ?? []);

function qualitySortKey(item: VideoOption & { quality?: number }): number {
  if (typeof item.quality === "number" && Number.isFinite(item.quality)) {
    return item.quality;
  }
  const match = item.qualityLabel.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

const sortedQualityList = computed(() => {
  return [...qualityList.value].sort((a, b) => qualitySortKey(a) - qualitySortKey(b));
});

const selectedQualityIndex = ref(0);

function qualityKey(quality: VideoOption, index: number): string {
  return `${quality.downloadUrl}-${quality.audioUrl ?? ""}-${index}`;
}

const selectedQuality = computed(() => {
  const list = sortedQualityList.value;
  if (!list.length) return undefined;
  const idx = selectedQualityIndex.value;
  if (idx >= 0 && idx < list.length) return list[idx];
  return list[0];
});

function findQualityIndexByDownloadUrl(list: VideoOption[], url?: string): number {
  const normalized = (url || "").trim();
  if (!normalized) return -1;
  return list.findIndex((q) => q.downloadUrl === normalized);
}

function findQualityIndexByLabel(list: VideoOption[], label?: string): number {
  const normalized = (label || "").trim();
  if (!normalized) return -1;
  return list.findIndex((q) => q.qualityLabel === normalized);
}

function initSelectedQuality(): void {
  const list = sortedQualityList.value;
  if (!list.length) {
    selectedQualityIndex.value = 0;
    return;
  }
  const video = currentVideo.value;
  const byDownloadUrl = findQualityIndexByDownloadUrl(list, video?.downloadUrl);
  if (byDownloadUrl >= 0) {
    selectedQualityIndex.value = byDownloadUrl;
    return;
  }
  const preset = (props.payload.selectedQuality || "").trim();
  if (preset) {
    const byPreset = findQualityIndexByLabel(list, preset);
    if (byPreset >= 0) {
      selectedQualityIndex.value = byPreset;
      return;
    }
  }
  const videoLabel = (video?.qualityLabel as string | undefined)?.trim();
  if (videoLabel) {
    const byLabel = findQualityIndexByLabel(list, videoLabel);
    if (byLabel >= 0) {
      selectedQualityIndex.value = byLabel;
      return;
    }
  }
  selectedQualityIndex.value = 0;
}

watch([currentIndex, () => props.payload.selectedQuality, qualityList], initSelectedQuality, {
  immediate: true,
});

function selectQuality(index: number): void {
  selectedQualityIndex.value = index;
}

function isQualitySelected(index: number): boolean {
  return selectedQualityIndex.value === index;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
}
</script>

<style scoped lang="less">
.video-selector {
  width: 100%;
}

.no-videos {
  text-align: center;
  padding: 16px;
  font-size: 0.8rem;
  color: var(--stay-secondaryFont, #888);
}

.pending-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--stay-border, #333);
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #ffffff;
  }
}

.pending-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.poster {
  width: 96px;
  height: 54px;
  border-radius: 5px;
  overflow: hidden;
  flex: 0 0 96px;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.poster-placeholder {
  color: var(--stay-secondaryFont, #666);
}

.info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title {
  font-size: 0.82rem;
  color: var(--stay-black, #e0e0e0);
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.68rem;
  color: var(--stay-secondaryFont, #888);
}

.meta .type {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.82);
}

.quality-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.quality-chip {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 22px;
  padding: 0 10px;
  height: 24px;
  box-sizing: border-box;
  border-radius: 8px;
  border: none;
  background: var(--stay-background);
  color: var(--stay-black);
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &.is-selected {
    background: var(--stay-primary);
    color: #ffffff;
  }
}

.download-cta {
  width: 100%;
  height: 30px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 20px;
  border: none;
  background: var(--stay-black);
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 400;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #3a3c40;
  }
}

.download-icon {
  width: 14px;
  height: 14px;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  pointer-events: none;
  filter: brightness(0) invert(1);
}

.download-label {
  font-weight: 600;
}
</style>
