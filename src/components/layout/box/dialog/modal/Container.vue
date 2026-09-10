// src/components/modal/ModalContainer.vue
<template>
  <transition name="fade">
    <div v-if="visible" class="modal-container" :class="isMobile()?'mobile':'desktop'" @click.self="handleMaskClick">
      <transition name="scale">
        <div class="modal-content">
          <component
            :is="currentComponent"
            v-bind="componentProps"
            @confirm="handleConfirm"
            @cancel="handleCancel"
          />
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Component } from 'vue';
import { isMobile } from '@/utils/device';

interface ModalOptions {
  maskClosable?: boolean;
  title?: string;
}

const visible = ref(false);
const currentComponent = ref<Component | null>(null);
const componentProps = ref<Record<string, any>>({});
let resolveCallback: ((value: boolean) => void) | null = null;
let options = ref<ModalOptions>({
  maskClosable: true,
  title: location.hostname,
});

// 显示弹窗
const showModal = (component: Component, props: Record<string, any>, opts?: ModalOptions): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    currentComponent.value = component;
    componentProps.value = props;
    options.value = { ...options.value, ...opts };
    visible.value = true;

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none' // 禁止移动端滑动
    document.body.style.width = '100%'
    resolveCallback = resolve;
  });
};

// 隐藏弹窗
const hideModal = (): void => {
  visible.value = false;

  document.body.style.overflow = ''
  document.body.style.touchAction = ''
  document.body.style.position = ''
};

// 处理确认
const handleConfirm = (): void => {
  hideModal();
  if (resolveCallback) {
    resolveCallback(true);
    resolveCallback = null;
  }
};

// 处理取消
const handleCancel = (): void => {
  hideModal();
  if (resolveCallback) {
    resolveCallback(false);
    resolveCallback = null;
  }
};

// 处理遮罩点击
const handleMaskClick = (): void => {
  console.log("options.value.maskClosable-----", options.value.maskClosable);
  if (options.value.maskClosable) {
    handleCancel();
  }
};

// 暴露方法给插件
defineExpose({
  showModal,
  hideModal
});
</script>

<style lang="less" scoped>
/* 样式部分保持不变 */
.modal-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 2147483000;
  &.desktop{
    align-items: flex-start;
  }
  &.mobile{
    align-items: center;
  }
  .modal-content {
    background-color: var(--stay-backgroundSecondary);
    border-radius: 8px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 90%;
    max-height: 80vh;
  }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.scale-enter-active, .scale-leave-active {
  transition: transform 0.3s ease;
}
.scale-enter-from, .scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>