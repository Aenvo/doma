<template>
  <div v-if="show" class="action-modal" role="dialog" aria-modal="false">
    <button class="action-modal-close" type="button" aria-label="关闭" @click="close">×</button>
    <div class="action-modal-title">{{ title }}</div>
    <button class="action-modal-btn" type="button" @click="onOk">{{ buttonText }}</button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  buttonText: { type: String, default: "确定" },
});

const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "action"): void;
  (e: "close"): void;
}>();

function close() {
  emit("update:show", false);
  emit("close");
}

function onOk() {
  emit("action");
  emit("update:show", false);
}
</script>

<style scoped lang="less">
.action-modal {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 100%;
  margin-bottom: 15px;
  padding: 18px 18px 16px;
  background: var(--stay-backgroundSecondary, #fff);
  border: 1px solid var(--stay-border, #e0e0e0);
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  z-index: 200;
}

.action-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--stay-backgroundTertiary, rgba(0, 0, 0, 0.06));
  color: var(--stay-secondaryFont, #666);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: var(--stay-border, rgba(0, 0, 0, 0.1));
    color: var(--stay-black, #333);
  }
}

.action-modal-title {
  padding-right: 36px;
  font-size: 14px;
  font-weight: 400;
  color: var(--stay-black);
  letter-spacing: 0.2px;
}

.action-modal-btn {
  margin-top: 14px;
  width: 100%;
  height: 30px;
  border: 0;
  border-radius: 15px;
  background: var(--stay-black);
  color: var(--stay-backgroundSecondary, #fff);
  font-size: 14px;
  font-weight: 600;
  line-height: 30px;
  cursor: pointer;

  &:hover {
    opacity: 0.88;
  }
}
</style>

