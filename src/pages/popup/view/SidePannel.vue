<template>
  <div class="slider-pannel-wrapper chat-mode">
    <ChatPanel />
  </div>
</template>
<script setup lang="ts">
import ChatPanel from '@/components/chat/ChatPanel.vue';

</script>
<style scoped lang="less">
.slider-pannel-wrapper{
  width: 100%;
  display: flex;
  flex: 1;
  transition: all 0.4s ease;
  max-width: 360px;
  height: 100vh;
  min-height: 100vh;
  flex-direction: column;

  &.chat-mode {
    transition: none;
    position: relative;
    align-items: stretch;
    padding: 0;
    height: 100vh;
    min-height: 100vh;
    max-height: 100vh;
    overflow: hidden;
    max-width: none;
  }
}
</style>
