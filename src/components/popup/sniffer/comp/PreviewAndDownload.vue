<template>
  <div v-show="show" class="preview-download-wrapper">
    <div class="preview-box" v-if="type == 2" @click.stop="closePreview">
      <div class="preview">
        <img :src="downloadList && downloadList.length ? downloadList[0].objectUrl : ''">
        <div class="download" @click.stop="downloadImgAction" v-if="downloadList && downloadList.length && !downloading">
          <svg fill="#B620E0" fill-opacity="1" version="1.1" width="20" height="26" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 17.6953 24.7168">
            <g>
              <rect height="24.7168" opacity="0" width="17.6953" x="0" y="0"/>
              <path d="M17.334 10.166L17.334 19.8047C17.334 21.8164 16.3086 22.832 14.2676 22.832L3.06641 22.832C1.02539 22.832 0 21.8262 0 19.8047L0 10.166C0 8.14453 1.03516 7.13867 3.06641 7.13867L6.05469 7.13867L6.05469 8.71094L3.0957 8.71094C2.11914 8.71094 1.57227 9.22852 1.57227 10.2441L1.57227 19.7266C1.57227 20.7422 2.10938 21.2598 3.08594 21.2598L14.2383 21.2598C15.2051 21.2598 15.7617 20.7422 15.7617 19.7266L15.7617 10.2441C15.7617 9.22852 15.2051 8.71094 14.2383 8.71094L11.2695 8.71094L11.2695 7.13867L14.2676 7.13867C16.3086 7.13867 17.334 8.1543 17.334 10.166Z" />
              <path d="M8.67188 1.94336C8.25195 1.94336 7.89062 2.28516 7.89062 2.69531L7.89062 12.627L7.94922 14.0918L7.40234 13.5156L5.88867 11.9043C5.75195 11.748 5.54688 11.6699 5.35156 11.6699C4.94141 11.6699 4.64844 11.9531 4.64844 12.3535C4.64844 12.5684 4.73633 12.7246 4.88281 12.8711L8.10547 15.9766C8.30078 16.1719 8.4668 16.2305 8.67188 16.2305C8.86719 16.2305 9.0332 16.1719 9.22852 15.9766L12.4512 12.8711C12.5977 12.7246 12.6855 12.5684 12.6855 12.3535C12.6855 11.9531 12.373 11.6699 11.9727 11.6699C11.7773 11.6699 11.582 11.748 11.4453 11.9043L9.93164 13.5156L9.38477 14.0918L9.44336 12.627L9.44336 2.69531C9.44336 2.28516 9.0918 1.94336 8.67188 1.94336Z" />
            </g>
          </svg>
        </div>
        <div class="downloading" v-if="downloading">
          <DaisyLoading :size="0.3" :style="{zIndex: '999',width:'24px', height: '24px'}" :active="downloading" v-show="downloading"></DaisyLoading>
        </div>
      </div>
    </div>
    <div class="download-tips-box" v-else>
      <div class="download-tips">
        <div class="tips" v-html="showDownloadNum(downloadCount)"></div>
        <div class="download" @click.stop="downloadImgAction" v-if="downloadList && downloadList.length && !downloading">
          <svg fill="#B620E0" fill-opacity="1" version="1.1" width="20" height="26" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 17.6953 24.7168">
            <g>
              <rect height="24.7168" opacity="0" width="17.6953" x="0" y="0"/>
              <path d="M17.334 10.166L17.334 19.8047C17.334 21.8164 16.3086 22.832 14.2676 22.832L3.06641 22.832C1.02539 22.832 0 21.8262 0 19.8047L0 10.166C0 8.14453 1.03516 7.13867 3.06641 7.13867L6.05469 7.13867L6.05469 8.71094L3.0957 8.71094C2.11914 8.71094 1.57227 9.22852 1.57227 10.2441L1.57227 19.7266C1.57227 20.7422 2.10938 21.2598 3.08594 21.2598L14.2383 21.2598C15.2051 21.2598 15.7617 20.7422 15.7617 19.7266L15.7617 10.2441C15.7617 9.22852 15.2051 8.71094 14.2383 8.71094L11.2695 8.71094L11.2695 7.13867L14.2676 7.13867C16.3086 7.13867 17.334 8.1543 17.334 10.166Z" />
              <path d="M8.67188 1.94336C8.25195 1.94336 7.89062 2.28516 7.89062 2.69531L7.89062 12.627L7.94922 14.0918L7.40234 13.5156L5.88867 11.9043C5.75195 11.748 5.54688 11.6699 5.35156 11.6699C4.94141 11.6699 4.64844 11.9531 4.64844 12.3535C4.64844 12.5684 4.73633 12.7246 4.88281 12.8711L8.10547 15.9766C8.30078 16.1719 8.4668 16.2305 8.67188 16.2305C8.86719 16.2305 9.0332 16.1719 9.22852 15.9766L12.4512 12.8711C12.5977 12.7246 12.6855 12.5684 12.6855 12.3535C12.6855 11.9531 12.373 11.6699 11.9727 11.6699C11.7773 11.6699 11.582 11.748 11.4453 11.9043L9.93164 13.5156L9.38477 14.0918L9.44336 12.627L9.44336 2.69531C9.44336 2.28516 9.0918 1.94336 8.67188 1.94336Z" />
            </g>
          </svg>
        </div>
        <div class="downloading" v-if="downloading">
          <DaisyLoading :size="0.3" :style="{zIndex: '999',width:'24px', height: '24px'}" :active="downloading" v-show="downloading"></DaisyLoading>
        </div>
      </div>
    </div>
  </div>
  <!-- <transition name="fade">
  </transition> -->
</template>
<script setup>
import { reactive, ref, inject, computed, toRefs, watch, onUnmounted, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDomain, getFilenameByUrl } from '@/utils/url'
import { formatDateNoSymbol } from "@/utils/date"
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { getContext, getCurrentTab } from "@/services/Context";
import { isMobile } from '@/utils/device';

const { t } = useI18n();

const global = inject('global');
const store = global.store;
const emit = defineEmits(['closePreview', 'download'])
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  downloadList: {
    type: Array,
    default: () => []
  },
  type: {
    type: Number,
    default: 2 // 0: 初始状态待选择，1: 正在选择状态, 2: preview预览状态
  },
  downloadNum: {
    type: Number,
    default: 0 
  },
  downloadCompleted: {
    type: Boolean,
    default: false
  }
})

const state = reactive({
  platform: import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME,
  downloading: false,
  tabId: "",
  downloadCount: props.downloadNum,
  tabMenu: store.state.popupTabMenuActivated,
})

/** Open：无会员体系 */
const isProType = computed(() => true);

const { downloading, downloadCount, tabMenu } = toRefs(state)

const closePreview = () => {
  emit("closePreview")
}

const closePopupAction = () => {
  // no-op：Open 无 UpgradePro
}

watch(props, (newProps) => {
    // 接收到的props的值
    state.downloadCount = newProps.downloadNum;
    // console.log("newProps.downloadCompleted-------", props.downloadCompleted, newProps.downloadCompleted)
    // (state.downloadCount > 0 && state.downloadCount == props.downloadList.length) || 
    if(newProps.downloadCompleted == true){
      state.downloading = false;
      // console.log("newProps.downloadCompleted------", newProps.downloadCompleted, state.downloading)
      closePreview();
      window.close();
    }

    if(newProps.type == 0){
      state.downloading = false;
    }

  },
  { immediate: true, deep: true }
);



const getDownloadFilename = (item, index) => {
  if(item.format == "url"){
    let filename = getFilenameByUrl(item.downloadUrl);
    const regex = /\.(jpg|png|webp|jpeg|tiff|ico|bmp|gif|apng|svg|)$/i; // i 表示不区分大小写
    const isMatch = regex.test(filename);
    if(isMatch){
      return filename;
    }
    return `${filename}.${item.suffix || 'jpg'}`;
  }else{
    const hostUrl = item.hostUrl;
    const domain = getDomain(hostUrl)
    const dateStr = formatDateNoSymbol(new Date())
    return `${domain}_${dateStr}_${index}.${item.suffix || 'jpg'}`;
  }
}

const downloadImgAction = () => {
  if(state.downloading){
    return;
  }
  state.downloading = true;
  const downloadInBrowserList = [];
  props.downloadList.forEach((item, index) => {
    const downloadUrl = item.objectUrl;
    const fileName = getDownloadFilename(item, index);
    if(state.platform && (state.platform == "Safari" || (state.platform == "responsive" && isMobile()))){
      // console.log("in safari")
      downloadInBrowserList.push({...item, fileName})
    }else{
      getContext().browser.downloads.download({url: downloadUrl, filename: fileName}, (id)=>{
      // state.downloading = false
        state.downloadCount = state.downloadCount + 1;
        // console.log("download------", id)
      });
      if(index == props.downloadList.length - 1){
        state.downloading = false;
        emit("closePreview")
      }
    }
  })
  downloadInBrowser(downloadInBrowserList);
}

const downloadInBrowser = (downloadInBrowserList) => {
  if(downloadInBrowserList.length == 1){
    getCurrentTab((url, tabId) => {
      state.tabId = tabId
      getContext().browser.tabs.sendMessage(tabId, { group: 'popup', filename: downloadInBrowserList[0].fileName, downloadUrl: downloadInBrowserList[0].objectUrl,  operate: 'downloadFile' }, (res) => {
        console.log('downloadFile-----res--------', res)
        state.downloading = false;
        if(res && res.success){
          window.close();
        }else{
          global.toast(t('download_fail'))
        }
      });
    })
  }else{
    emit("download", downloadInBrowserList)
    // getContext().browser.tabs.sendMessage(tabId, { from: 'popup', downloadList, operate: 'createFolderAndDownload' }, (res) => {
    //   console.log('downloadFile-----res--------', res)
    // });
  }
}

const showDownloadNum = computed(()=>(downloadCount)=>{ 
  if(state.downloading){
    let s = `<span>${downloadCount}</span>/${props.downloadList.length}`
    return t("download_img_num").replace("[num]", s);
  }else{
    let s = props.downloadList && props.downloadList.length ? props.downloadList.length : 0
    return t("select_img_num").replace("[num]", s);
  }
})

</script>
<style lang="less" scoped>
.preview-download-wrapper{
  .preview-box{
    position: fixed;
    width: 100%;
    z-index: 99999;
    height: 100%;
    bottom: 0;
    left: 0;
    right: 0;
    padding-top: 119px;
    .preview{
      background-color: var(--stay-background);
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      user-select: none;
      img{
        max-width: 100%;
        max-height: 100%;
      }
      .download{
        position: absolute;
        right: 20px;
        bottom: 20px;
        width: 30px;
        height: 30px;
        overflow: hidden;
        background-color: var(--stay-backgroundSecondary);
        border-radius: 5px;
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
        svg{
          fill: var(--s-main);
        }
      }
      .downloading{
        position: absolute;
        right: 10px;
        bottom: 10px;
        width: 30px;
        height: 30px;
      }
      
    }
  }

  .download-tips-box{
    width: 100%;
    height: 60px;
    position: fixed;
    z-index: 99999;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid var(--stay-border);
    .download-tips{
      background-color: var(--stay-background);
      padding: 0 10px;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      .tips{
        font-size: var(--stay-text-subheadline);
        font-weight: 700;
        color: var(--stay-secondaryFont);
        position: relative;
        bottom: 0;
        span{
          color: var(--stay-secondaryFont)
        }
      }
      .download{
        position: absolute;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        width: 30px;
        height: 30px;
        // background: url("@/assets/popup/download.png") no-repeat 50% 50%;
        // background-size: 60%;
        svg{
          fill: var(--s-main);
        }
      }
      .downloading{
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 30px;
        height: 30px;
      }
    }
  }
  :deep(.upgrade-pro-dialog){
    // width: 360px;
    .content{
      padding-bottom: 80px!important;
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}

</style>