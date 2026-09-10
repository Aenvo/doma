<template>
  <div class="popup-fotter-wrapper menu-height" ref="fotterRef">
    <div class="fotter-box">
      <div class="tab-item" v-for="(item, index) in tabList" :key="index" @click="tabClickAction(item.id)">
        <div class="tab-img" :key="item.name" :class="[item.id == selectedTabId?'selected':'unselecte', item.name]" >
          <Image :src="item.icon" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, defineEmits, inject, ref, toRefs, watch, onMounted, onUnmounted, defineProps } from 'vue'
import { useI18n } from 'vue-i18n';
import Image from '@/components/layout/box/Image.vue';
import { isMobile } from '@/utils/device';

const { t } = useI18n();

// const global = inject('global') as Record<string, any>;

const props = defineProps({
  tabId: {
    type: Number,
    default: 50
  },
});

const emit = defineEmits(['setTab'])


let tabInitList = [
  {
    id: 50, 
    selected: 1, 
    name: 'bookmarks_tab', 
    whatisurl: '', 
    whatistitle:'',
    icon: ""
  },
  {
    id: 20, 
    selected: 0, 
    name: 'darkmode_tab', 
    whatisurl: 'https://www.craft.do/s/PHKJvkZL92BTep', 
    whatistitle:'what_darkmode',
    icon: ""
  },
  {
    id: 30, 
    selected: 0, 
    name: 'downloader_tab', 
    whatisurl: 'https://www.craft.do/s/sYLNHtYc0n2rrV', 
    whatistitle:'what_downloader',
    icon: ""
  },
  {
    id: 40, 
    selected: 0, 
    name: 'adblock_tab', 
    whatisurl: 'https://www.craft.do/s/nmtd0ZD3a9Z48w', 
    whatistitle:'what_adblock',
    icon: ""
  }
]
  

const state = reactive({
  tabList: tabInitList,
  selectedTabId: props.tabId || 50,
});
const fotterRef = ref(null);

const { tabList, selectedTabId } = toRefs(state);

watch(
  props,
  (newProps) => {
    // 接收到的props的值
    state.selectedTabId = newProps.tabId;
  },
  { immediate: true, deep: true }
);


onMounted(()=>{
  
})

const tabClickAction = (tabId) => {
  if (!tabId) {
    return;
  }
  state.selectedTabId = tabId
  state.tabList.forEach(item => {
    if (item.id === tabId) {
      emit('setTab', item);
    }
  })
}

    
</script>

<style lang="less" scoped>
.menu-height{
  height: 60px;
  .fotter-box{
    .tab-item{
      top: 0;
    }
  }
}

.popup-fotter-wrapper{
  width: 100%;
  background-color: var(--stay-background);
  position: fixed;
  // top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 999;
  transform: translateZ(0px);
  -webkit-transform: translateZ(0px);
  border-top: 1px solid var(--stay-border);
  -webkit-transform: translate3d(0,0,0);
  will-change: transform;
  .fotter-box{
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    -webkit-transform: translate3d(0,0,0);
    will-change: transform;
    .tab-item{
      width: 25%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 1;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      position: relative;
      .tab-img{
        width: 40px;
        height: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 1;
        overflow: hidden;
        position: relative;
        // top: -6px;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        z-index: 999;
        &.bookmarks_tab{
          svg{
            scale: 0.32;
          }
        }
        &.selected{
          svg{
            fill: var(--s-main);
            * {
              fill: var(--s-main);
            }
          }
        }
        &.unselecte{
          svg {
            fill: var(--stay-black);
            * {
              fill: var(--stay-black);
            }
          }
        }
      }
    }
  }
}

</style>
