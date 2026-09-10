<template>
  <transition name="drawer">
    <div v-if="open" class="slider-wrapper">
      <slot></slot>
    </div>
  </transition>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: true
  }
});

const open = ref<boolean>(props.isOpen);

watch(() => props.isOpen, (newValue) => {
  open.value = newValue;
});

</script>
<style scoped lang="less">

.slider-wrapper{
  position: relative;
  left: 0;
  width: 240px;
  padding-left: 5px;
  height: 100%;
  // background-color: #fff;
  transition: left 0.5s ease;
  display: flex;
  flex-direction: column;
  align-items: self-start;
  justify-content: start;
  
}

.drawer-enter-from,
.drawer-leave-to {
  left: -260px;
}

.drawer-enter-to,
.drawer-leave-from {
  left: 0;
}

</style>
