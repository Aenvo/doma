// src/components/modal/CustomAlert.vue
<template>
  <div class="custom-alert">
    <div class="alert-content">
      <div class="title">{{ title }}</div>
      <div class="alert-message">{{ message }}</div>
      <div class="alert-buttons">
        <div class="confirm-btn" @click="handleConfirm">{{ confirmText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">


const props = defineProps({
  title: { type: String, default: window.location.hostname },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确定' }
})

const emit = defineEmits(['confirm'])

const handleConfirm = () => emit('confirm')
</script>

<style lang="less" scoped>
.custom-alert {
  padding: 0 15px;
  width: 448px;
  height: 100%;
  box-shadow: 0 0 12px 0 rgba(0, 0, 0, 0.1);
  .alert-content {
    background-color: var(--stay-backgroundSecondary);
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    .title{
      width: 100%;
      padding-top: 15px;
      height: 47px;
      line-height: 25px;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      position: sticky;
      background-color: var(--stay-backgroundSecondary);
      top: 0;
      left: 0;
      color: var(--stay-black);
      font-weight: 600;
      font-size: var(--stay-text-headline);
      z-index: 999;
    }
    .alert-message { 
      font-size: var(--stay-text-subheadline); 
      text-align: left;
      color: var(--stay-black); 
      overflow-y: auto;
      word-break: break-word;
      display: flex;
      flex: 1;
    }
    .alert-buttons {
      background-color: var(--stay-backgroundSecondary);
      display: flex;
      width: 100%;
      height: 63px;
      padding-bottom: 15px;
      padding-top: 8px;
      justify-content: flex-end;
      align-items: center;
      position: sticky;
      bottom: 0;
      z-index: 999;
      .confirm-btn {
        background-color: #1890ff;
        font-size: var(--stay-text-subheadline); 
        color: var(--stay-backgroundSecondary); 
        cursor: pointer;
        width: 80px;
        height: 34px;
        line-height: 34px;
        border-radius: 4px;
        text-align: center;
        transition: background-color 0.2s;
        user-select: none;
        &:hover { background-color: #1371ca; }
      }
    }
  }
}

@media screen and (max-width: 768px) {
  .custom-alert {
    width: 300px;
    .alert-content{
      .title{
        text-align: center;
      }
      .confirm-message{
        text-align: center;
        justify-content: center;
      }
      .alert-buttons{
        justify-content: center;
        .confirm-btn {
          width: 100%;
          background-color: transparent;
          color: #0b84f5; 
          font-weight: 600;
          &:hover { background-color: transparent; }
        }
      }
    }
  }
}

</style>