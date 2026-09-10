<template>
  <div class="loading-wrapper" v-if="active" :style="mask ? {} : {backgroundColor: 'transparent'}">
    <div class="stay-loading-box">
      <div class="loading-spinner" ></div>
      <div class="loading-text" v-if="text">{{ text }}</div>
      <slot v-else></slot>
    </div>
    
  </div>
</template>

<script setup lang="ts">
defineProps({
  active: {
    type: Boolean,
    default: false
  },
  mask: {
    type: Boolean,
    default: true
  },
  text: {
    type: String,
    default: ''
  },
  loadingColor: {
    type: String,
    default: '#f7f7f7'
  }
})
</script>

<style scoped lang="less">
.loading-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 99999999;
  .stay-loading-box{
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 10px;
    .loading-text{
      color: var(--stay-loading);
      font-size: var(--stay-text-subheadline);
      display: flex;
      flex: 1;
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid v-bind(loadingColor);
      border-top: 3px solid transparent;
      border-radius: 50%;
      // cubic-bezier(0.68, -0.55, 0.27, 1.55)
      animation: spin 1s linear infinite;
      transform: translateZ(0);
      backface-visibility: hidden;
      &::after {
        content: '';
        position: absolute;
        top: -3px;
        left: -3px;
        right: -3px;
        bottom: -3px;
        border: 3px solid transparent;
        border-top-color: v-bind(loadingColor);
        border-radius: 50%;
        animation: spin 1.8s linear infinite;
      }
    }

  }
  
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style> 