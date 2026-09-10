<template>
  <div class="popup-wrapper" :class="isMobile() ? 'mobile': 'desktop'">
    <div class="popup-view">
      <Header :title="$t(currentTabMenu.name)" :tab-id="currentTabMenu.id">
        <Nav :list="navList" :activatedId="currentNav[currentTabMenu.name]" @change="navActionClick" v-if="navList && navList.length > 0"/>
        <div class="tool-box">
          <div class="options tool" @click="handleClickToolAction('options')">
            {{ $t('options') }}
          </div>
          <div class="splite" v-if="isSupportSidePannel()"></div>
          <div class="side-pannel tool" @click="handleClickToolAction('sidepannel')" v-if="isSupportSidePannel()">
            {{ $t('sidebar') }}
          </div>
        </div>
      </Header>
      <!-- <Home v-if="currentTabMenu.id === 1" /> -->
      <Button v-if="isProEdition()" @click="getCurrentVideoInfo">获取当前页面视频</Button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, inject, computed, onBeforeMount, onMounted } from 'vue'
import Button from '@/components/layout/box/Button.vue';
import TabMenu from '@/components/popup/TabMenu.vue'
import { type PopupMenu } from '@/types/MenuTypes';
import Header from '../header/Header.vue';
import Nav from '../header/Nav.vue';
import { reloadCurrentPage, getContext, openOptionsPage, getCurrentTab, isBrowserProtected } from '@/services/Context';
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { useI18n } from 'vue-i18n';
import { isMobile } from '@/utils/device';

import Image from '@/components/layout/box/Image.vue'
import SidebarSvg from '@/assets/images/sidebar.svg'
import SettingSvg from '@/assets/images/menu/setting.svg'
import { isSupportSidePannel } from '@/utils/feature'
import { isProEdition } from '@/config/buildEdition'
import { demoFindAndDownloadCurrentTabVideos } from '@/edition/popupVideoDemo'


const handleClickToolAction = (tab: string) => {
  if("sidepannel" === tab){
    getContext().browser.windows.getCurrent({populate: true},(_win:any)=>{
      console.log('_win----',_win)
      getContext().browser.sidePanel.open({ windowId: _win.id });
      window.close();
    })
  }else{
    openOptionsPage();
  }
}

const { t } = useI18n();

const showTips = ref(false);
const tips = ref("");
const showRefresh = ref(false);
const isLoading = ref(false);

const global = inject('global') as Record<string, any>;
const store = global.store;

const TabRelateHeaderNav = {
  home_tab: [],
  bookmarks_tab: [],
  adblock_tab: [
    {text: 'web_tag', id: 'webTag'},
    {text: 'tag_rules', id: 'tagRules'},
    // {text: 'trusted', id: 'trusted'},
  ],
  // disabled: !isMobile()
  downloader_tab: [
    {text: 'videos', id: 'videos'},
    {text: 'files', id: 'files'},
    {text: 'images', id: 'images'},
  ],
  darkmode_tab: [ 
    {text: 'dark_set', id: 'settings'},
    {text: 'dark_theme', id: 'themes'}
  ],
  userscripts_tab: [
    {text: 'state_activated', id: 'activated'},
    {text: 'state_stopped', id: 'stopped'}
  ],
} as Record<string, any>;

console.log("store.state.popupTabMenuActivated-----", store.state.popupTabMenuActivated);
const currentTabMenu = ref<PopupMenu>(store.state.popupTabMenuActivated || {id: 1, name: 'home_tab'});
// {
//   adblock_tab: "webTag",
//   downloader_tab: "videos",
//   darkmode_tab: "settings",
//   userscripts_tab: "activated",
// }
const currentNav = ref<Record<string, any>>(store.state.popupHeaderNavActivated);

// 计算当前tab的header nav的item，与pro有关系
const navList = computed(() => {
  const list = TabRelateHeaderNav[currentTabMenu.value.name];
  // todo 计算当前tab的header nav的item，与pro有关系
  return list;
})


const handleSetTabMenu = (tab: PopupMenu) => {
  console.log("handleSetTabMenu-----", tab);
  currentTabMenu.value = tab;
  store.commit('setPopupTabMenuActivated', tab);

  // store.state.popupTabMenuActivated = tab;
  console.log("handleSetTabMenu---store.state.popupTabMenuActivated-----", store.state.popupTabMenuActivated);
}

/**
 * 
 * @param nav {text: '', id: ''}
 */
const navActionClick = (nav:any) => {
  console.log("navActionClick-----", nav);
  currentNav.value[currentTabMenu.value.name] = nav.id;
  store.commit('setPopupHeaderNavActivated', currentNav.value);
}



// 在 Popup 的脚本中（如 popup.js）
document.addEventListener('DOMContentLoaded', () => {
  // 固定宽度或根据内容设置
  document.documentElement.style.minWidth = '360px';
  document.body.style.width = '360px';
});




const clickRefresh = () => {
  isLoading.value = true;
  showRefresh.value = false;
  tips.value = t('extension_been_reloaded') + t('loading_page');
  reloadCurrentPage().then(()=>{
    getContext().browser.tabs.onUpdated.addListener(function(_tabId:any, changeInfo:any, tab:any) {
      console.log('changeInfo', changeInfo);
      if (changeInfo.status === 'complete') {
        console.log('标签页已加载完成:', tab.url);
        // 执行操作
        window.location.reload();
        showTips.value = false;
        isLoading.value = false;
        
        tips.value = "";
      }
    });
  })

}



onBeforeMount(async () => {
  console.log("onBeforeMount---popup--");
  
})

const remoteSyncTask = () => {
  console.log('remoteSyncTask=========');
  
}

const getCurrentVideoInfo = async () => {
  await demoFindAndDownloadCurrentTabVideos();
}

onMounted(()=>{
  remoteSyncTask();
})

</script>
<style scoped lang="less">
.popup-wrapper{
  display: flex;
  flex: 1;
  transition: all 0.4s ease; /* 修改过渡属性 */
  // min-width: 320px;
  max-width: 460px;
  height: 500px;
  padding: 0px;
  padding-bottom: 60px;
  &.mobile{
    width: 100%;
    height: 100vh;
  }
  &.desktop{
    width: 360px;
  }
  .popup-view {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    flex: 1;
    transition: all 0.4s ease;
    width: 100%;
    height: 100%;
    padding: 0px;
    overflow-y: auto;
    position: relative;
    .tool-box{
      position: absolute;
      top: 7px;
      right: 10px;
      height: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
      padding: 0 10px;
      border-radius: 10px;
      background-color: var(--stay-backgroundSecondary);
      box-shadow: 0px 1px 3px 0px rgba(0, 0, 0, 0.1);
      .tool{
        // width: 32px;
        // border-radius: 50%;
        // border: 1px solid var(--stay-border);
        cursor: pointer;
        user-select: none;
        font-size: var(--stay-text-subbody);
        color: var(--stay-black);
        font-weight: 500;
      }
      .splite{
        width: 1px;
        height: 18px;
        background-color: var(--stay-black);
      }
      .options{
        svg{
          scale: 1.25;
        }
      }
      .side-pannel{
        svg{
          scale: 0.78;
        }
      }
    }
  }
}

</style>