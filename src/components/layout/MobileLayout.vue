<template>
  <div class="option-wrapper-box">
    <div class="header">
      <div class="title">{{ $t(viewPathName) }}</div>
    </div>
    <div class="content-wrapper">
      <slot></slot>
    </div>
    <TabBar @change="handleChangeMenu" />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import TabBar from './mobile/TabBar.vue';

const emit = defineEmits(['view']);

const viewPathName = ref('');

const handleChangeMenu = (viewPath: string) => {
  emit('view', viewPath);
  viewPathName.value = (viewPath||"").replace("#", "");
}


</script>
<style scoped lang="less">
.option-wrapper-box{
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0;
  justify-content: start;
  align-items: start;
  flex: 1;
  padding-top: 45px;
  padding-bottom: 60px;
  .header{
    background-color: var(--stay-background);
    width: 100%;
    height: 45px;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 999999;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    display: flex;
    .title{
      position: absolute;
      left: 48px;
      font-size: var(--stay-text-headline);
      font-weight: 700;
      color: var(--stay-black);
    }
  }
  .content-wrapper{
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: start;
    flex: 1;
    overflow: hidden;
  }
}
</style>
