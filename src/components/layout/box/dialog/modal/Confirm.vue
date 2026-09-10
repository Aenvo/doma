// src/components/modal/CustomConfirm.vue
<template>
  <div class="custom-confirm">
    <div class="confirm-content">
      <div class="title">{{ title }}</div>
      <div class="confirm-message">{{ message }}</div>
      <div class="confirm-buttons">
        <div class="cancel-btn" @click="handleCancel">{{ cancelText }}</div>
        <div class="confirm-btn" @click="handleConfirm">{{ confirmText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  title: { type: String, default: window.location.hostname },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' }
})

const emit = defineEmits(['confirm', 'cancel'])

const handleConfirm = () => emit('confirm')
const handleCancel = () => emit('cancel')
</script>

<style lang="less" scoped>
.custom-confirm {
  padding: 0 15px;
  width: 448px;
  height: 100%;
  box-shadow: 0 0 12px 0 rgba(0, 0, 0, 0.1);
  .confirm-content {
    background-color: var(--stay-backgroundSecondary);
    border-radius: 12px;
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
    .confirm-message {
      font-size: var(--stay-text-subheadline); 
      text-align: left;
      color: var(--stay-black); 
      overflow-y: auto;
      word-break: break-word;
      display: flex;
      flex: 1;  
    }
    .confirm-buttons {
      display: flex;
      width: 100%;
      height: 63px;
      padding-bottom: 15px;
      padding-top: 8px;
      justify-content: flex-end;
      align-items: center;
      position: sticky;
      bottom: 0;
      gap: 10px;
      background-color: var(--stay-backgroundSecondary);
      z-index: 999;
      .cancel-btn, .confirm-btn {
        // border: 4px;
        user-select: none;
        font-size: var(--stay-text-subheadline); 
        cursor: pointer; 
        transition: background-color 0.2s;
        width: 80px;
        height: 34px;
        line-height: 34px;
        border-radius: 4px;
        text-align: center;
      }
      .cancel-btn { 
        color: var(--stay-black); 
        background-color: var(--stay-backgroundTertiary);
        &:hover {
          background-color: var(--stay-disabled-text);
        }
      }
      .confirm-btn { 
        color: var(--stay-backgroundSecondary); 
        background-color: #1890ff; 
        &:hover { background-color: #1371ca; }
      }
    }
  }
}
@media screen and (max-width: 768px) {
  .custom-confirm {
    width: 300px;
    .confirm-content{
      .title{
        text-align: center;
      }
      .confirm-message{
        text-align: center;
        justify-content: center;
      }
      .confirm-buttons{
        height: auto;
        padding-top: 15px;
        flex-direction: column-reverse;
        align-items: center;
        justify-content: center;
        .cancel-btn { 
          width: 100%;
          color: #0b84f5;
          font-weight: 700;
          background-color: transparent;
          &:hover {
            background-color: transparent;
          }
        }
        .confirm-btn { 
          width: 100%;
          color: #0b84f5;
          background-color: transparent;
          &:hover { background-color: transparent; }
        }
      }
    }
  }
}
</style>