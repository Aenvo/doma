<template>
  <div class="image-wrapper">
    <div class="sniffer-image-box" v-if="imgList && imgList.length">
      <SelectFilter :selectStatus="actionType"  @selectSize="handleSelectSize" @selectAction="handleSelectFilter"></SelectFilter>
      <Waterfall
        :list="imgList"
        :filter="filterRatio"
        :width="172"
        rowKey="objectUrl"
        :lazyload="false"
        :hasAroundGutter="true"
        cardRadius="10px"
        animationEffect="" 
        posDuration="10"
        imgSelector="objectUrl"
        ref="waterfall"
        >
        <template #item="{url, item, index}" >
          <!-- item.format=='url'?item.downloadUrl:item.objectUrl -->
          <div class="card" :key="index" :downloadUrl="item.format=='url'?item.downloadUrl:item.objectUrl " @click="cardItemAction(item, index)">
            <LazyImg :url="url" :item="item"  @load="handleImgLoad" />
            <div class="selected-mask" v-if="selectedIndexSet.has(index)">
              <div class="selected">
                <svg fill="#B620E0" fill-opacity="1" version="1.1" width="20" height="20" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 20.2832 19.9316">
                  <g>
                    <rect height="19.9316" opacity="0" width="20.2832" x="0" y="0"/>
                    <path d="M19.9219 9.96094C19.9219 15.4492 15.459 19.9219 9.96094 19.9219C4.47266 19.9219 0 15.4492 0 9.96094C0 4.46289 4.47266 0 9.96094 0C15.459 0 19.9219 4.46289 19.9219 9.96094ZM12.998 6.08398L8.82812 12.7832L6.8457 10.2246C6.60156 9.90234 6.38672 9.81445 6.10352 9.81445C5.66406 9.81445 5.32227 10.1758 5.32227 10.6152C5.32227 10.8398 5.41016 11.0547 5.55664 11.25L8.00781 14.2578C8.26172 14.5996 8.53516 14.7363 8.86719 14.7363C9.19922 14.7363 9.48242 14.5801 9.6875 14.2578L14.2773 7.03125C14.3945 6.82617 14.5215 6.60156 14.5215 6.38672C14.5215 5.92773 14.1211 5.63477 13.6914 5.63477C13.4375 5.63477 13.1836 5.79102 12.998 6.08398Z" />
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </template>
      </Waterfall>
    </div>
    <SnifferNull :title="$t('sniffer_image_none')" :desc="$t('sniffer_image_none_prompt')" @contactAction="contactClick" @retryAction="retryAction" v-if="imgList.length<=0 && !snifferLoading"></SnifferNull>
    <DaisyLoading :size="0.4" :style="{position: 'absolute', zIndex: '999',width:'60px', height: '60px', top: '160px', left: '50%', transform: 'translateX(-50%)'}" :active="snifferLoading" v-show="snifferLoading"></DaisyLoading>
    <PreviewAndDownload 
      :downloadNum="downloadCount" 
      :download-completed="downloadCompleted" 
      :download-list="downloadList" 
      :type="actionType" 
      :show="actionType == 1 || actionType == 2" 
      @closePreview="closePreview" 
      @download="downloadListInContent" 
    />
  </div>
</template>
<script setup>
import { reactive, ref, defineEmits, inject, toRefs, watch, onUnmounted, defineProps } from 'vue'
import { getDomain, getHostname, base64ToObjectURL } from '@/utils/url'
import { useI18n } from 'vue-i18n';
import SelectFilter from './comp/SelectFilter.vue';
import PreviewAndDownload from './comp/PreviewAndDownload.vue';
import SnifferNull from './SnifferNull.vue';
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import  { LazyImg, Waterfall } from '@/components/layout/box/vue3-waterfall';
import { getContext, getCurrentTab, openUrlInSafariPopup } from "@/services/Context"
import toast from "@/components/layout/box/toast/index"

const { t } = useI18n();

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
const waterfall = ref(null);
const browserUrl = ref('');
let snifferImageConnect = "";
const global = inject('global');
const store = global.store;
const state = reactive({
  filterRatio: {width: 0, height: 0, operator: ">="},
  snifferLoading: true,
  folderOptions: props.folder,
  selectedFolder: props.defaultFolder,
  imgList: [],
  preview: '',
  downloadList: [],
  actionType: 0, // 0: 初始状态待选择(init)，1: 正在选择状态(select), 2: preview预览状态(preview)
  selectedIndexSet: new Set(),
  downloadCount: 0,
  downloadCompleted: false,

});

const { downloadCount, downloadCompleted, selectedIndexSet, downloadList, actionType, imgList, snifferLoading, filterRatio } = toRefs(state);

watch(
  props,
  (newProps) => {
    state.folderOptions = newProps.folder;
    state.selectedFolder = newProps.defaultFolder;
    // console.log("state.selectedFolder-----",state.selectedFolder)
  },
  { immediate: true, deep: true }
);


onUnmounted(()=>{
  snifferImageConnect.postMessage({operate: 'disconnectAndDestroy'});
  snifferImageConnect.onDisconnect.addListener(message => {
    snifferImageConnect = "";
    // console.log("SnifferImageConnectPort--onDisconnect-----", message)
  });
})

const handleImgLoad = (e) => {
  // console.log("handleImgLoad------", e)
}

// const checkImageUrlAnd

const cardItemAction = (item, index) => {
  if(state.downloadCount > 0){
    toast({title: t('pictures_downloading')})
    return;
  }
  // start select
  if(state.actionType == 1){
    console.log("start select")
    if(state.selectedIndexSet.has(index)){
      state.selectedIndexSet.delete(index)
      // todo
      state.downloadList = state.downloadList.filter(selected => selected.objectUrl != item.objectUrl);
    }else{
      state.downloadList.push(item)
      state.selectedIndexSet.add(index)
    }
  }else{
    // preview image
    state.downloadList = [{...item}]
    state.actionType = 2
  }
}

const contactClick = () => {
  openUrlInSafariPopup(`mailto:feedback@fastclip.app?subject=${t('sniffer_image_none')}&body=${encodeURIComponent(browserUrl.value)}`);
}

const handleSelectSize = (ratioSize, operator) => {
  state.filterRatio = {width: ratioSize[0], height: ratioSize[1], operator: operator}
}

const handleSelectFilter = (status) => {
  // false0: 初始状态待选择，true1: 正在选择状态, 2: preview预览状态
  state.actionType = status
  if(state.actionType == 0){
    closePreview()
    // 取消下载
    snifferImageConnect.postMessage({operate: 'cancelDownload'})
  }
}

const closePreview = () => {
  state.downloadList = [];
  state.actionType = 0;
  state.downloadCount = 0;
  state.downloadCompleted = false;
  state.selectedIndexSet = new Set();
}

const downloadListInContent = (downloadList) =>{
  snifferImageConnect.postMessage({operate: 'createFolderAndDownload', downloadList})
}

const retryAction = () => {
  console.log("retryAction start")
  if(state.snifferLoading){
    return;
  }
  state.snifferLoading = true;
  if(snifferImageConnect){
    // console.log("retryAction, has snifferImageConnect");
    try {
      snifferImageConnect.postMessage({operate: 'downloadFetchImageInfoFromPopup'})
    } catch (error) {
      let timer = setTimeout(()=>{
        state.snifferLoading = false;
        clearTimeout(timer);
        timer = ""
        snifferImageConnect = ""
      }, 1000)
      
    }
  }else{
    console.log("retryAction, no snifferImageConnect");
    createSnifferImageConnectToListenerInfo()
  }
}


const platform = import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME;

const createSnifferImageConnectToListenerInfo = () => {
  state.snifferLoading = true;
  // todo weburl
  getCurrentTab((url, tabId) => {
    browserUrl.value = url;
    // console.log('global.getCurrentTabId--------',tabId);
    snifferImageConnect = getContext().browser.tabs.connect(tabId, {name: 'POPUP_DOWNLOADER_IMAGE_CONNECT'});
    // const pid = Math.random().toString(36).substring(2, 9);
    // console.log("snifferImageConnect  create------", typeof snifferImageConnect, snifferImageConnect);
    snifferImageConnect.postMessage({operate: 'downloaderFetchImageInfoFromPopup'});
    // console.log("snifferImageConnect---postMessage----downloadFetchImageInfoFromPopup--");
    snifferImageConnect.onMessage.addListener(async (message) => {
      const {operate, pageUrl, channel, imgItem, downloadCount} = message;
      // console.log('snifferImageConnect收到消息：----------------', imgItem);
      if('pushImageListToPopup' == operate){
        await handleReceiveImgItem(imgItem);
      }else if('downloadCountForImageInSafari' == operate){
        let dcnt = downloadCount || 1;
        state.downloadCount = state.downloadCount + dcnt
      }else if('downloadCompletedImageInSafari' == operate){
        // console.log("downloadCompletedImageInSafari---------")
        state.downloadCompleted = true;
      }
      const timer = setTimeout(()=>{
        state.snifferLoading = false;
        clearTimeout(timer);
      }, 2000)
      return true;
    });
  })
}

const handleReceiveImgItem = (imgItem) => {
  return new Promise((resolve, reject) => {
    if(imgItem){
      const hasItem = state.imgList.some(image => image.downloadUrl === imgItem.downloadUrl);
      if(hasItem){
        resolve();
        return
      }
      if(imgItem.dataUrl){
        const startTime = new Date().getTime();
        // console.log("imgItem.start-----", )
        imgItem.objectUrl = base64ToObjectURL(imgItem.dataUrl);
        // console.log("imgItem.objectUrl---", (new Date().getTime() - startTime), imgItem.dataUrl, imgItem.downloadUrl, imgItem.objectUrl)
      }
      state.imgList.push({
        ...imgItem,
      })
      resolve();
    }
  })
}

createSnifferImageConnectToListenerInfo()

</script>
<style lang="less" scoped>
.image-wrapper{
  width: 100%;
  height: 100%;
  padding-top: 45px;
  position: relative;
  display: flex;
  flex: 1;
  .sniffer-image-box{
    height: 100%;
    width: 100%;
    display: flex;
    flex: 1;
    .card{
      position: relative;
      user-select: none;
      .selected-mask{
        position: absolute;
        top: 0px;
        left: 0px;
        width: 100%;
        height: 100%;
        background-color: rgba(255,255,255,0.2);
        border-radius: 10px;
        .selected{
          width: 20px;
          height: 20px;
          position: absolute;
          right: 10px;
          bottom: 5px;
          // background: url("@/assets/popup/select.png") no-repeat 50% 50%;
          // background-size: contain;
          svg{
            fill: var(--s-main);
          }
        }
      }
    }
  }
}
</style>