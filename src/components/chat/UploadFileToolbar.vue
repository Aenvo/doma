<template>
  <div
    v-if="files.length"
    class="upload-file-toolbar"
    role="group"
    aria-label="附件"
  >
    <span
      v-for="f in files"
      :key="f.id"
      class="upload-file-pill"
      :class="{
        'is-loading': f.status === 'loading',
        'is-error': f.status === 'error',
        'has-preview': !!f.previewUrl,
      }"
      :data-file-id="f.id"
    >
      <button
        v-if="f.previewUrl"
        type="button"
        class="upload-file-thumb-wrap"
        aria-label="查看大图"
        @click="onPreviewClick(f, $event)"
      >
        <img class="upload-file-thumb" :src="f.previewUrl" alt="" @error="onThumbError" />
        <span v-if="f.status === 'loading'" class="upload-file-thumb-loading">
          <span class="upload-file-spinner" aria-label="loading"></span>
        </span>
      </button>
      <span v-else-if="f.status === 'loading'" class="upload-file-spinner" aria-label="loading"></span>
      <span class="upload-file-info">
        <span class="upload-file-name" :title="f.name">{{ f.name || "image" }}</span>
        <span class="upload-file-meta">{{ formatBytes(f.size) }}</span>
      </span>
      <button
        type="button"
        class="upload-file-remove"
        aria-label="移除附件"
        @click="$emit('remove', f.id)"
      >
        ×
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
type FileLike = {
  id: string;
  name: string;
  size: number;
  status?: "loading" | "ready" | "error";
  previewUrl?: string;
};

defineProps<{
  files: FileLike[];
}>();

const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "preview", payload: { id: string; previewUrl: string; name: string }): void;
}>();

function onPreviewClick(f: FileLike, e: Event) {
  if (!f.previewUrl) return;
  e.stopPropagation();
  emit("preview", {
    id: f.id,
    previewUrl: f.previewUrl,
    name: f.name || "image",
  });
}

function onThumbError(e: Event) {
  const img = e.target as HTMLImageElement | null;
  if (img) img.style.display = "none";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  const d = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(d)} ${units[i]}`;
}
</script>

<style scoped>
.upload-file-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 6px 0;
  padding: 0;
  user-select: none;
}

.upload-file-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, 100%);
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(47, 49, 52, 0.18);
  background: #ffffff;
  color: var(--stay-black);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.upload-file-pill.has-preview {
  padding: 6px 8px 6px 6px;
}

.upload-file-thumb-wrap {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(47, 49, 52, 0.06);
  cursor: zoom-in;
}

.upload-file-thumb-wrap:hover {
  opacity: 0.92;
}

.upload-file-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.upload-file-thumb-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.45);
}

.upload-file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.upload-file-spinner {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid rgba(47, 49, 52, 0.15);
  border-top-color: rgba(47, 49, 52, 0.55);
  animation: upload-file-spin 0.8s linear infinite;
}

@keyframes upload-file-spin {
  to {
    transform: rotate(360deg);
  }
}

.upload-file-pill.is-loading {
  opacity: 0.92;
}

.upload-file-pill.is-error {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(220, 38, 38, 0.06);
}

.upload-file-name {
  min-width: 0;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.upload-file-meta {
  flex: 0 0 auto;
  font-size: 12px;
  color: rgba(47, 49, 52, 0.62);
}

.upload-file-remove {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: rgba(47, 49, 52, 0.06);
  color: rgba(47, 49, 52, 0.7);
  cursor: pointer;
  line-height: 18px;
  padding: 0;
}

.upload-file-remove:hover {
  background: rgba(47, 49, 52, 0.12);
  color: var(--stay-black);
}
</style>
