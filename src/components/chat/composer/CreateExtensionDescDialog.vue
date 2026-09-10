<template>
  <Teleport to="body">
    <div v-if="visible" class="create-ext-desc-overlay" @mousedown.self="onCancel">
      <div
        class="create-ext-desc-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="create-ext-desc-header">
          <h2 class="create-ext-desc-title">{{ title }}</h2>
          <button type="button" class="create-ext-desc-close" :aria-label="cancelText" @click="onCancel">
            ×
          </button>
        </div>
        <div class="create-ext-desc-body">
          <p class="create-ext-desc-hint">{{ hint }}</p>
          <textarea
            ref="textareaRef"
            v-model="draft"
            class="create-ext-desc-textarea"
            rows="5"
            :placeholder="placeholder"
            spellcheck="false"
          />
          <label class="create-ext-desc-check">
            <input v-model="usePopup" type="checkbox" class="create-ext-desc-checkbox" />
            <span class="create-ext-desc-check-text">
              <span class="create-ext-desc-check-label">{{ usePopupLabel }}</span>
              <span class="create-ext-desc-check-hint">{{ usePopupHint }}</span>
            </span>
          </label>
        </div>
        <div class="create-ext-desc-footer">
          <button type="button" class="create-ext-desc-btn create-ext-desc-btn--primary" @click="onConfirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

export type CreateExtensionDescConfirmPayload = {
  description: string;
  usePopup: boolean;
};

const props = defineProps<{
  visible: boolean;
  title: string;
  hint: string;
  placeholder: string;
  usePopupLabel: string;
  usePopupHint: string;
  confirmText: string;
  cancelText: string;
}>();

const emit = defineEmits<{
  confirm: [payload: CreateExtensionDescConfirmPayload];
  cancel: [];
}>();

const draft = ref("");
/** 默认勾选：带 popup；取消勾选则仅点击图标触发 */
const usePopup = ref(true);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    draft.value = "";
    usePopup.value = true;
    await nextTick();
    textareaRef.value?.focus();
  },
);

function onConfirm() {
  emit("confirm", {
    description: draft.value.trim(),
    usePopup: usePopup.value,
  });
}

function onCancel() {
  emit("cancel");
}
</script>

<style scoped lang="less">
.create-ext-desc-overlay {
  position: fixed;
  inset: 0;
  z-index: 10040;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
}

.create-ext-desc-dialog {
  width: min(420px, 100%);
  max-height: min(80vh, 520px);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--stay-background, #fff);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.create-ext-desc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 8px;
}

.create-ext-desc-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--stay-text, #2f3134);
}

.create-ext-desc-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  color: rgba(47, 49, 52, 0.55);
  cursor: pointer;
}

.create-ext-desc-body {
  padding: 4px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.create-ext-desc-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(47, 49, 52, 0.65);
}

.create-ext-desc-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 110px;
  padding: 10px 12px;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  font-family: inherit;
  color: var(--stay-text, #2f3134);
  background: var(--stay-background, #fff);
}

.create-ext-desc-textarea:focus {
  outline: none;
  border-color: var(--stay-primary, #3674ef);
}

.create-ext-desc-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 4px;
  cursor: pointer;
  user-select: none;
}

/* common.less 全局 appearance:none 会抹掉原生勾选框，用伪元素自绘（同 AddSkillDialog） */
.create-ext-desc-checkbox {
  position: relative;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  flex-shrink: 0;
  cursor: pointer;
  vertical-align: middle;

  &::after {
    position: absolute;
    inset: 0;
    display: block;
    content: "";
    border-radius: 4px;
    box-sizing: border-box;
    border: 1px solid var(--stay-border, #d0d0d0);
    background: var(--stay-backgroundSecondary, #fff);
  }

  &:checked::after {
    content: "\2713";
    display: inline-block;
    text-align: center;
    font-size: 12px;
    line-height: 14px;
    font-weight: 700;
    color: #fff;
    border-color: var(--stay-primary, #3674ef);
    background: var(--stay-primary, #3674ef);
  }

  &:focus-visible::after {
    outline: 2px solid rgba(54, 116, 239, 0.35);
    outline-offset: 1px;
  }
}

.create-ext-desc-check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.create-ext-desc-check-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--stay-text, #2f3134);
  line-height: 1.35;
}

.create-ext-desc-check-hint {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(47, 49, 52, 0.55);
}

.create-ext-desc-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--stay-border, #e8e8e8);
}

.create-ext-desc-btn {
  height: 32px;
  min-width: 72px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.create-ext-desc-btn--primary {
  border: none;
  background: var(--stay-primary, #3674ef);
  color: #fff;
}
</style>
