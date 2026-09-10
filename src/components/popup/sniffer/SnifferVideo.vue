<template>
  <div class="video-wrapper" >
    <div class="sniffer-video-box" v-if="videoList && videoList.length">
      <SnifferItem v-for="(sniffer, index) in videoList" :folder="folderOptions" type="video" :key="index" :item="sniffer"></SnifferItem>
    </div>
    <SnifferNull :title="snifferNone" :desc="snifferNonePrompt" @contactAction="contactClick" @retryAction="retryAction" v-if="(!videoList || videoList.length==0) && !snifferLoading"></SnifferNull>
    <DaisyLoading :size="0.4" :style="{position: 'absolute', width:'60px', height: '60px', top: '120px', left:'50%', transform: 'translateX(-50%)'}" :active="snifferLoading" v-show="snifferLoading"></DaisyLoading>
    <div class="long-press-wrapper" v-if="isMobileBol" >
      <div class="long-press-switch"  >
        <div class="switch-text">{{ longpressText }}</div>
        <!-- <div class="switch" :class="longPressStatusRes=='on'?'switch-on':'switch-off'" @click="longPressSwitchClick">{{ longPressSwitch }}</div> -->
        <Switch class="switch" :on="longPressOn" @change="longPressSwitchClick"></Switch>
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, reactive, defineEmits, inject, toRefs, computed, watch, onUnmounted, defineProps } from 'vue'
import { MD5 } from 'crypto-js';
import { isMobile } from "@/utils/device"
import { useI18n } from 'vue-i18n';
import SnifferItem from './SnifferItem.vue';
import Switch from '@/components/layout/box/Switch.vue';
import SnifferNull from './SnifferNull.vue';
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { getContext, getCurrentTab, openUrlInSafariPopup } from "@/services/Context"

const { t } = useI18n();
const platformName = import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME;
const props = defineProps({
  folder: {
    type: Array,
    default: ()=>{[]}
  },
  defaultFolder: {
    type: Object,
    default: ()=>{}
  }
});

const emit = defineEmits(['download'])

let snifferConnect = "";
const global = inject('global');
const store = global.store;
const browserUrl = ref('');
const state = reactive({
  snifferLoading: true,
  folderOptions: props.folder,
  videoList: [],
  longPressOn: !!store.state.longPressStatus,
  isMobileBol: isMobile(),
  selectedFolder: {},
  platform: platformName
});

const { isMobileBol, platform, longPressStatus, videoList, snifferLoading, folderOptions } = toRefs(state);

watch(
  props,
  (newProps) => {
    // 接收到的props的值
    state.folderOptions = newProps.folder;
    state.selectedFolder = newProps.defaultFolder;
  },
  { immediate: true, deep: true }
);

const contactClick = () => {
  openUrlInSafariPopup(`mailto:feedback@fastclip.app?subject=${snifferNone().value}&body=${encodeURIComponent(browserUrl.value)}`);
}

const snifferNone = computed(()=>{ 
  if(state.platform == "StayBrowser_Android"){
    return t('resource_sniffer_none');
  }else{
    return t('sniffer_none');
  }
})

const snifferNonePrompt = computed(()=>{ 
  if(state.platform == "StayBrowser_Android"){
    return t('resource_sniffer_none_prompt');
  }else{
    return t('sniffer_none_prompt');
  }
})

const longpressText = computed(()=>{ 
  if(state.platform == "StayBrowser_Android"){
    return t('resource_longpress');
  }else{
    return t('longpress');
  }
})

const retryAction = () => {
  console.log("retryAction start")
  state.snifferLoading = true;
  try {
    if(snifferConnect){
      console.log("retryAction, has snifferConnect");
      snifferConnect.postMessage({ from: 'popup', operate: 'snifferFetchVideoInfo'})
    }else{
      console.log("retryAction, no snifferConnect");
      createSnifferConnectToListenerInfo()
    }
  } catch (error) {
    state.snifferLoading = false;
  }
}

const longPressSwitchClick = (checked) => {
  // console.log('longPressSwitchClick====')
  if(state.longPressStatus == 'on'){
    state.longPressStatus = 'off';
  }else{
    state.longPressStatus = 'on';
  }
  store.commit('setLongPressStatus', state.longPressStatus);

  getCurrentTab((url, tabId) => {
    getContext().browser.tabs.sendMessage(tabId, { from: 'popup', longPressStatus: state.longPressStatus, operate: 'setLongPressStatus'}, (response) => {
      // console.log('longPressSwitchClick----response',response)
      if(response){
        getContext().browser.tabs.reload(tabId);
      }
    })
  })
}


const createSnifferConnectToListenerInfo = () => {
  getCurrentTab((url, tabId) => {
    browserUrl.value = url;
    // console.log('global.getCurrentTabId--------',tabId);
    snifferConnect = getContext().browser.tabs.connect(tabId, {name: 'POPUP_SNIFFER_CONNECT'});
    // const pid = Math.random().toString(36).substring(2, 9);
    snifferConnect.postMessage({ from: 'popup', operate: 'snifferFetchVideoInfo'})
    snifferConnect.onMessage.addListener((message, sender, sendResponse) => {
      state.snifferLoading = false;
      console.log('snifferConnect收到消息：----------------', message, sender);
      const {operate, pageUrl, videoInfoList} = message;
      if('pushVideoInfoToPopup' == operate){
        if(videoInfoList){
          // console.log("videoInfoList----", videoInfoList);
          let videoList = videoInfoList;
          videoList.forEach(item=>{
            // md5d对比一下，不一致进行覆盖，一致跳出
            const hasItem = state.videoList.some(video => video.videoUuid === item.videoUuid);
            if(hasItem){
              state.videoList.forEach((video)=>{
                if(video.videoUuid == item.videoUuid){
                  console.log("video----",video,MD5(JSON.stringify(video)))
                  console.log("item----",item,MD5(JSON.stringify(item)))
                  if(MD5(JSON.stringify(video)) != MD5(JSON.stringify(item))){
                    // console.log("videoInfoList----", item);
                    handleVideoInfoItem(item);
                    video.adType = item.adType
                    video.type = item.type
                    video.faviconUrl = item.faviconUrl || video.faviconUrl;
                    video.title = item.title || video.title;
                    video.poster = item.poster || video.poster;
                    video.hostUrl = item.hostUrl || video.hostUrl;
                    video.qualityList = item.qualityList;
                    video.downloadUrl = item.downloadUrl || video.downloadUrl;
                    video.audioUrl = item.audioUrl || video.audioUrl;
                    video.selectedFolder = item.selectedFolder;
                    video.selectedFolderText = item.selectedFolderText;
                    video.selectedQuality = item.selectedQuality;
                    video.selectedQualityText = item.selectedQualityText;

                    // return video;
                  }
                }
                
              })
              return
            }

            handleVideoInfoItem(item);
            state.videoList.push(item)
          });
          console.log('state.videoList---------',state.videoList);
          // state.videoList = videoList;
        }else{
          state.videoList = [];
        }
      }
      return true;
    });

  })
}

const handleVideoInfoItem = (item = {}) => {
  item.selectedFolder = state.selectedFolder.uuid;
  item.selectedFolderText = state.selectedFolder.name;

  if(item.qualityList && item.qualityList.length ){
    item.qualityList.forEach(quality=>{
      if(item.downloadUrl == quality.downloadUrl){
        item.selectedQuality = quality.downloadUrl;
        item.selectedQualityText = quality.qualityLabel;
        item.audioUrl = quality.audioUrl;
      }
    })
    if(!item.selectedQuality){
      item.selectedQuality = item.qualityList[0].downloadUrl;
      item.selectedQualityText = item.qualityList[0].qualityLabel;
      item.audioUrl = item.qualityList[0].audioUrl;
    }
  }
}

const fetchLongPressStatus = () => {
  getCurrentTab((url, tabId) => {
    browserUrl.value = url;
    getContext().browser.tabs.sendMessage(tabId, { from: 'popup', operate: 'getLongPressStatus'}, (response) => {
      // console.log('longPressSwitchClick----response',response)
      if(response){
        state.longPressStatus = response
      }
    })
  })
}

onUnmounted(()=>{
  snifferConnect.postMessage({operate: 'disconnectAndDestroy'});
  snifferConnect = "";
})

const startSnifferConfigAndConnect = () => {
  createSnifferConnectToListenerInfo()
  fetchLongPressStatus();
}


startSnifferConfigAndConnect()
</script>

<style lang="less" scoped>
.video-wrapper{
  width: 100%;
  height: 100%;
  padding: 10px 0;
  position: relative;
  display: flex;
  flex: 1;
  // user-select: none;
  .long-press-wrapper{
    width: 100%;
    padding: 0 10px;
    position: fixed;
    bottom: 70px;
    left: 0;
    z-index: 999;
  }
  .long-press-switch{
    position: relative;
    width: 100%;
    height: 42px;
    border-radius: 8px;
    border: 1px solid var(--stay-border);
    background-color: var(--stay-backgroundSecondary);
    display: flex;
    padding: 0 80px 0 20px;
    justify-content: center;
    justify-items: center;
    align-items: center;
    user-select: none;
    .switch-text{
      width: 100%;
      color: var(--stay-black);
      height: 100%;
      display: flex;
      align-items: center;
      user-select: none;
    }
    .switch{
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
    }

  }
  .sniffer-video-box{
    padding: 0px 0 0px 10px;
    width: 100%;
  }
}

</style>
