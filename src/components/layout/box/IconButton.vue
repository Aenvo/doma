<template>
  <button class="icon-button" :class="{ 'icon-button-disabled': disabled }" @click="handleClick">
    <Image v-if="icon" :src="icon" class="button-icon" />
    <span class="button-text"><slot></slot></span>
  </button>
</template>

<script setup lang="ts">
import Image from './Image.vue';

const props = defineProps<{
  icon?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event);
  }
};
</script>

<style scoped lang="less">
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--stay-border);
  background-color: white;
  color: #8A8A8A;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background-color: var(--stay-backgroundSecondary);
  }

  &:active {
    background-color: var(--stay-background);
  }

  .button-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .button-text {
    font-size: var(--stay-text-body);
  }

  &.icon-button-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style> 