<template>
  <div class="popup-header-wrapper" ref="headerRef" >
    <div class="header-content">
      <div class="stay-icon"></div>
      <div class="title">{{ title }}</div>
      <Switch :on="userScriptSwitch" @change="changeUserscriptsSwitch" v-if="!isFetchScriptState && tabId === 10"></Switch>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
import {
  ref,
  onBeforeMount
} from 'vue';
import Switch from '@/components/layout/box/Switch.vue';
import { Storage } from '@/store/Storage';

defineProps({
  title: {
    type: String,
    default: ''
  },
  tabId: {
    type: Number,
    default: 10
  }
})

const storage = Storage.init();
const headerRef = ref(null);
const userScriptSwitch = ref(true);
const isFetchScriptState = ref(true);

const changeUserscriptsSwitch = (val) => {
  console.log('changeUserscriptsSwitch---userScriptSwitch--------', val);
  userScriptSwitch.value = val;
  storage.set('_userscript_switch', val);
}
onBeforeMount(()=>{
  storage.get('_userscript_switch').then(res=>{
    isFetchScriptState.value = false;
    if(typeof res === 'boolean'){
      userScriptSwitch.value = res;
    }
  })
})
</script>
<style lang="less" scoped>
.popup-header-wrapper{
  width: 100%;
  background-color: var(--stay-background);
  -webkit-backdrop-filter: saturate(150%) blur(16px);
  backdrop-filter: saturate(150%) blur(16px);
  transform: translateZ(0);
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  // border-bottom: 1px solid var(--stay-border);
  z-index: 999;
  .stay-switch{
    position: absolute;
    right: 0;
    width: 48px;
    height: 38px;
    top: 50%;
    padding: 2px;
    transform: translate(0, -50%);
    &.start{
      background: url("@/assets/popup/pause.png") no-repeat 50% 50%;
      background-size: 40%;
    }
    &.cease{
      background: url("@/assets/popup/play.png") no-repeat 50% 50%;
      background-size: 40%;
    }

  }
  .header-content{
    width: 100%;
    height: 100%;
    padding-left: 35px;
    display: flex;
    justify-content: flex-start;
    justify-items: center;
    align-items: center;
    position: relative;
    height: 44px;
    gap: 10px;
    .stay-icon{
      position: absolute;
      left: 0;
      width: 40px;
      height: 44px;
      top: 50%;
      padding: 2px;
      transform: translate(0, -50%);
      background: url("@/assets/popup/stay-header.png") no-repeat 50% 50%;
      background-size: 50%;
    }
    .icon-text{
      position: absolute;
      left: 12px;
      width: 23px;
      height: 23px;
      top: 50%;
      transform: translate(0, -50%);
      border-radius: 5px;
      cursor: default;
      user-select: none;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      img{
        width: 100%;
        height: 100%;
      }
      .nick{
        padding: 5px;
        width: 100%;
        height: 100%;
        text-align: center;
        font-size: var(--stay-text-subheadline);
        font-weight: 600;
        color: var(--stay-backgroundSecondary);
        background-color: var(--s-main);
        border: 1px solid var(--s-main);
        display: flex;
        justify-content: center;
        align-items: center;
        &.pro{
          background: var(--stay-proBackground);
          color: var(--stay-pro);
          border: 1px solid var(--stay-proBorder);
        }
      }
    }
    .title{
      font-weight: 700;
      font-size: var(--stay-text-headline);
      color: var(--stay-black);
      padding-left: 4px;
    }
  }
}
</style>
