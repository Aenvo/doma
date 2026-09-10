<template>
  <div class="sniffer-item" >
    <div class="item-info" :style="{paddingBottom: platform == 'Safari'?'4px': '10px'}">
      <div class="img-info">
        <div class="item-con">
          <img :src="snifferItem.poster" v-if="snifferItem.poster"/>
          <template v-else>
            <div class="file-img" v-if="type == 'file'"> 
              <span>{{ getFileType(snifferItem.downloadUrl) }}</span>
            </div>
            <div class="no-img" v-else>
              <span>{{ domain(snifferItem.hostUrl) }}</span>
            </div>
          </template>
        </div>
        <div class="info">
          <div class="title">{{ hostname(snifferItem.hostUrl)}}</div>
          <div class="name">{{ snifferItem.shortTitle || snifferItem.title }}</div>
        </div>
      </div>
      <div class="download">
        <div class="btn" 
        :style="{color: downloading?'var(--stay-secondaryFont)':'var(--s-main)', borderColor: downloading?'var(--stay-secondaryFont)':'var(--s-main)'}" 
        @click="downloadClickAction(snifferItem)">{{snifferItem.adType=='ad'? t("ad") : t("download") }}</div>
        <DaisyLoading :size="0.2" :style="{position: 'absolute', width:'20px', height: '20px', right: '15px', top: '48%', transform: 'translateY(-50%)'}" :active="downloading" v-show="downloading"></DaisyLoading>
      </div>
    </div>
    <div class="item-download-info" v-if="platform == 'Safari' || platform == 'StayBrowser_Android'">
      <div class="folder-box">
        <div class="label-txt">{{ t("save_to_folder") }}&nbsp;:</div>
        <div class="folder select-options">
          <div class="selected-text" >{{snifferItem.selectedFolderText}}</div>
          <select class="select-container" v-model="snifferItem.selectedFolder" @change="changeSelectFolder(index, $event)">
            <option v-for="(o, i) in folderOptions" :style="{display: o.uuid?'block':'none'}" :name="o.name" :key="i" :value="o.uuid">{{o.name}}</option>
          </select>
        </div>
      </div>
      <div class="quality-box" v-if="(snifferItem.qualityList && snifferItem.qualityList.length)">
        <div class="label-txt">{{ t("quality") }}&nbsp;:</div>
        <div class="quality select-options">
          <div class="selected-text" >{{snifferItem.selectedQualityText}}</div>
          <select class="select-container" v-model="snifferItem.selectedQualityText" @change="changeSelectQuality($event)">
            <!-- {downloadUrl, qualityLabel, quality } -->
            <option v-for="(o, i) in snifferItem.qualityList" :key="i" :name="o.qualityLabel" :value="o.qualityLabel" :data-downloadUrl="o.downloadUrl">{{o.qualityLabel}}</option>
          </select>
        </div>
      </div>
    </div>
    <Dialog :show="showDialogContent>0"  @close="closePopupAction" animation="push-to-top" model="mobile" :footer="null" class="upgrade-pro-dialog">
      <!-- 2: 提示chrome浏览器开启允许用户脚本; 3: 提示edge浏览器开启允许用户脚本（安卓版开发者模式）; 4: 提示chrome浏览器开启开发者模式 -->
      <div class="allow-tips-box userscript" v-if="showDialogContent >= 2">
        <div class="title">{{ $t("download_tips") }}</div>
        <div class="title">{{ $t('allow_userscript_tips') }}</div>
        <div class="tips-list">
          <template v-if="showDialogContent == 2">
            <div v-for="(item, index) in $tm('allow_userscript_list')" class="tips" :key="index">{{ item }}</div>
          </template>
          <template v-else-if="getOSType() === 'android' && showDialogContent == 3">
            <div v-for="(item, index) in $tm('allow_android_developer_list')" class="tips" :key="index">{{ item }}</div>
          </template>
          <template v-else>
            <div v-for="(item, index) in $tm('allow_developer_list')" class="tips" :key="index">{{ replacePlaceholder(item) }}</div>
          </template>
        </div>
        <div class="img" >
          <img src="@/assets/images/allow-userscript.png" alt="" v-if="showDialogContent == 2"/>
          <template v-else-if="showDialogContent == 3">
            <img src="@/assets/images/edge-android-dev.png" alt=""  v-if="getOSType() === 'android'"/>
            <img src="@/assets/images/edge-developer.png" alt=""  v-else/>
          </template>
          <img src="@/assets/images/allow-developer.png" alt="" v-else />
        </div>
      </div>
    </Dialog>
  </div>
</template>
<script setup>
import { reactive, defineEmits, inject, toRefs, watch, computed, onUnmounted, defineProps, ref } from 'vue'
import { getDomain, getHostname, getFiletypeByUrl } from '@/utils/url'
import { useI18n } from 'vue-i18n';
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { getContext, openAppInPopup } from '@/services/Context';
import { isMobile, STAY_STORE_URL, isSupportChromeUserScript, isChrome, isEdge, getOSType } from '@/utils/device';
import { getCurrentTab } from '@/services/Context';
import Dialog from "@/components/layout/box/dialog/Dialog.vue";
import { isUserScriptsAvailable } from "@/services/extensionService";
import { isEdgeLite } from '@/utils/feature';

/** Open：无会员体系，本地功能不按 proType 门闸 */
const isProType = computed(() => true);

const { t } = useI18n();
const emit = defineEmits(['download'])

const global = inject('global');
const store = global.store;
const props = defineProps({
  browserUrl: {
    type: String,
    default: ''
  },
  currentTab: {
    type: String,
    default: 'activated'
  },
  folder: {
    type: Array,
    default: ()=>{[]}
  },
  item: {
    type: Object,
    default: ()=>{},
    required: true
  },
  type: {
    type: String,
    default: "video"
  }
});
const state = reactive({
  folderOptions: props.folder,
  snifferItem: props.item,
  platform: import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME,
  downloading: false,
  tabMenu: store.state.popupTabMenuActivated,
  showDialogContent: 0, // 0: 关闭状态, 1: 升级pro，2: 提示chrome浏览器开启允许用户脚本; 3: 提示edge浏览器开启允许用户脚本（安卓版开发者模式）; 4: 提示chrome浏览器开启开发者模式
});

const { snifferItem, downloading, platform, folderOptions, showDialogContent, tabMenu } = toRefs(state);

watch(
  props,
  (newProps) => {
    // 接收到的props的值
    state.snifferItem = newProps.item;
    state.folderOptions = newProps.folder
    console.log(state.snifferItem, state.folderOptions)
  },
  { immediate: true, deep: true }
);

const getFileType = computed(()=>(sourceUrl)=>{ 
  return getFiletypeByUrl(sourceUrl)
})

const domain = computed(()=>(hostUrl)=>{ 
  return getDomain(hostUrl)
})

const hostname = computed(()=>(hostUrl)=>{ 
  return getHostname(hostUrl)
})

const closePopupAction = () => {
  state.showDialogContent = 0;
}

/**
 * title:xxx,
 * hostUrl:xxx,
 * downloadUrl:xxx,
 * poster:xxx
 * uuid: 文件夹uuid
 * protect: 是否保护
 * qualityLabel: 视频分辨率
 *
 * stay://x-callback-url/snifferVideo?list=encodeURIComponent([{hostUrl,title,icon,downloadUrl...}])
 */
 const downloadClickAction = (item) => {
  const platformList = ["Safari", "StayBrowser_Android"];
  let schemaUrl = "";
  let list = [];
  if(props.type == "video"){
    if(!item.selectedFolder && platformList.includes(state.platform)){
      global.toast(t('select_folder'));
      return;
    }
    if(item.selectedQuality){
      item.downloadUrl = item.selectedQuality;
    }
    const type = item.type?item.type:"";
    list = [{type, faviconUrl: item.faviconUrl, title:item.title, videoUuid: item.videoUuid, downloadUrl: item.downloadUrl, poster: item.poster, websiteUrl: item.hostUrl, hostUrl: getHostname(item.hostUrl), uuid: item.selectedFolder, audioUrl: item.audioUrl?item.audioUrl:'', protect: item.protect?item.protect:false, qualityLabel: item.selectedQualityText }];
    console.log(item,list);
    schemaUrl = 'stay://x-callback-url/snifferVideo?list='+encodeURIComponent(JSON.stringify(list));
  }else{
    let filename = item.shortTitle || new Date().getTime();
    const downloadObj = {title: item.shortTitle || item.title, downloadUrl: item.downloadUrl, poster: item.poster, websiteUrl: item.hostUrl, hostUrl: getHostname(item.hostUrl), uuid: item.selectedFolder, protect: item.protect?item.protect:false };
    if(state.platform && platformList.includes(state.platform)){
      // console.log("in safari")
      let list = [{...downloadObj}];
      schemaUrl = 'stay://x-callback-url/downloadFile?list='+encodeURIComponent(JSON.stringify(list));
    }else{
      if(state.downloading){
        return;
      }
      state.downloading = true
      console.log("in pc browser but not safari", item)
      const illegalCharsRegex = /[!@#$%^&*()_+={}[\]:;"'<>,?/\\|~`]/g;
      // 使用replace方法替换非法字符为空字符串
      filename = filename.replace(illegalCharsRegex, '');
      console.log("filename--", filename)
      if(state.platform == "responsive" && isMobile()){
        getCurrentTab((url, tabId) => {
          state.tabId = tabId
          getContext().browser.tabs.sendMessage(tabId, { group: 'popup', filename: filename, downloadUrl: item.downloadUrl,  operate: 'downloadFile' }, (res) => {
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
        getContext().browser.downloads.download({url: item.downloadUrl, filename: filename}, (id)=>{
          state.downloading = false
        });
      }
      return;
    }
  }

  // edgeLite版本，只有IOS和macOS需要调整到store下载
  const osList = ["macos", "ios"]
  if(isEdgeLite() && osList.includes(getOSType())){
    const openText = t("open_stay_app_failed");
    schemaUrl && openAppInPopup(schemaUrl, STAY_STORE_URL, openText, ()=>{
      window.close();
    });
  }else{
    handleV3ExtensionVideoDownloader(list);
  }
  
}

const replacePlaceholder = (text) => {
  return text.replace(/{browser}/g, isEdge() ? 'edge' : 'chrome');
};

/**
 * 检查是否需要提示用户脚本开关
 * @returns 0: 不需要提示;  2: 提示chrome浏览器开启允许用户脚本; 3: 提示edge浏览器开启允许用户脚本（安卓版开发者模式）; 4: 提示chrome浏览器开启开发者模式
 */
const checkAllowUserScriptTips = () => {
  if(isUserScriptsAvailable() ||  "ios" == getOSType()){
    return 0;
  }else{
    if (isEdgeLite() || isEdge()){
      // edge 浏览器显示开发者模式
      console.log("startFetchUserscript-----edge")
      return 3;
    }
    else{
      // chrome 浏览器显示用户脚本开关
      // todo 判断移动端和pc端的chrome浏览器的开关样式
      console.log("startFetchUserscript-----chrome")
      if(isSupportChromeUserScript()){
        // 大于138版本chrome浏览器支持用户脚本
        return 2;
      }else{
        return 4;
      }
    }
  }
}

const handleV3ExtensionVideoDownloader = (videoList=[]) => {
  const allowStatus = checkAllowUserScriptTips();
  if(allowStatus>0){
    state.showDialogContent = allowStatus;
    return;
  }

  if(!isProType.value){
    // 请升级Stay Pro以使用视频下载器
    state.showDialogContent = 1;
    return;
  }
  // 浏览器切换到options页面
  getContext().browser.runtime.sendMessage({ origin: 'popup', list:videoList,  operate: 'downloader/video' }, (res) => {
    console.log('downloader/video-----res--------', res)
    // state.downloading = false;
    if(res && res.success){
      window.close();
    }else{
      global.toast(t('download_fail'))
    }
  });
}

const changeSelectFolder = (index, event) => {
  const selectOpt = event.target;
  console.log(selectOpt);
  state.snifferItem = {...state.snifferItem, selectedFolderText: selectOpt.options[selectOpt.selectedIndex].text, selectedFolder: selectOpt.value};
}

const changeSelectQuality = (event) => {
  const selectOpt = event.target;
  console.log(selectOpt, selectOpt.value, selectOpt.selectedIndex, selectOpt.options[selectOpt.selectedIndex].dataset.downloadUrl);
  let qualityIndex = selectOpt.selectedIndex;
  let qualityList = state.snifferItem.qualityList;
  // console.log('selectOpt.options[qualityIndex]-------',selectOpt.options[qualityIndex])
  state.snifferItem.selectedQualityText = selectOpt.value;
  state.snifferItem.selectedQualityIndex = qualityIndex;
  const qualityItem = qualityList[qualityIndex] || {};
  state.snifferItem.audioUrl = qualityItem.audioUrl;
  state.snifferItem.protect = qualityItem.protect;
  state.snifferItem.selectedQuality = qualityItem.downloadUrl;
  state.snifferItem.type = qualityItem.type;
  console.log(qualityItem.downloadUrl, qualityItem.type)
}

</script>
<style lang="less" >
.upgrade-pro-dialog{
  .content{
    padding-bottom: 80px!important;
    padding-top: 10px!important;
  }
  .allow-tips-box{
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: start;
    font-size: var(--stay-text-subbody);
    color: var(--stay-black);
    margin-top: -20px;
    .title{
      padding: 10px 0;
      font-size: var(--stay-text-subheadline);
      color: var(--stay-secondaryFont);
      font-size: 15px;
      font-weight: 700;
      font-style: bold;
    }
    
    .tips-list{
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: start;
      align-items: start;
      .tips{
        font-size: var(--stay-text-subbody);
        color: var(--stay-black);
        padding: 5px 0;
        font-weight: 400;
        line-height: 17px;
      }
    }
    .img{
      padding-top: 20px;
      width: 100%;
      img{
        max-width: 100%;
      }
    }
  }
}
.sniffer-item{
  width: 100%;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  justify-items: center;
  border-bottom: 0.5px solid var(--stay-border);
  flex: 1;
  .item-info{
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 65px;
    justify-items: center;
    align-items: center;
    padding-bottom: 4px;
    padding-right: 116px;
    position: relative;
    user-select: none;
    .img-info{
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding-left: 55px;
      position: relative;
      .item-con{
        width: 55px;
        height: 55px;
        border: 0.5px solid var(--stay-border);
        background-color: var(--stay-backgroundFirst);
        border-radius: 10px;
        display: flex;
        flex-shrink: 0;
        position: absolute;
        left: 0;
        align-items: center;
        justify-content: center;
        img{
          max-width: 100%;
          max-height: 100%;
        }
        .no-img{
          background: url("@/assets/popup/video-default.png") no-repeat 50% 32%;
          width: 100%;
          height: 100%;
          background-size: 50%;
          text-align: center;
          span{
            position: relative;
            top: 51%;
            font-family: 'Helvetica Neue';
            font-size: var(--stay-text-subfootnote);
            user-select: none;
            // color: var(--s-7a);
            color: var(--stay-secondaryFont);
          }
        }
        .file-img{
          background: url("@/assets/popup/file.png") no-repeat 50% 50%;
          width: 100%;
          height: 100%;
          background-size: 55%;
          display: flex;
          justify-content: center;
          align-items: center;
          span{
            position: relative;
            top: 5px;
            // transform: translateY(-50%);
            font-family: 'Helvetica Neue';
            font-size: var(--stay-text-subfootnote);
            user-select: none;
            // color: var(--s-7a);
            color: var(--stay-secondaryFont);
          }
        }
      }
      .info{
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: left;
        padding-left: 8px;
        user-select: none;
        .title{
          width: 100%;
          // color: var(--s-7a);
          color: var(--stay-secondaryFont);
          font-size: 12px;
          font-family: 'Helvetica Neue';
          text-align: left;
          line-height: 16px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          user-select: none;
        }
        .name{
          user-select: none;
          width: 100%;
          text-align: left;
          color: var(--stay-black);
          font-size: var(--stay-text-subbody);
          font-weight: 400;
          padding-top: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-height: 17px;
          span{
            font-weight: 700;
          }
        }

      }

    }
    .download{
      width: 110px;
      height: 100%;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-right: 10px;
      position:absolute;
      right: 0;
      user-select: none;
      .btn{
        width: 106px;
        // background-color: var(--stay-backgroundFirst);
        color: var(--s-main);
        font-size: var(--stay-text-subbody);
        font-weight: 700;
        height: 30px;
        user-select: none;
        cursor: default;
        line-height: 28px;
        border-radius: 15px;
        border: 1px solid var(--s-main);
        text-align: center;
      }
    }
  }
  .item-download-info{
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 24px;
    justify-content: space-between;
    justify-items: center;
    align-items: center;
    margin-bottom: 6px;
    padding-right: 10px;
    .folder-box{
      display: flex;
      justify-content: flex-start;
      align-items: center;
    }
    .quality-box{
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .label-txt{
      font-size: var(--stay-text-subbody);
      color: var(--stay-black);
      font-weight: 400;
      padding-right: 4px;
      height: 24px;
      line-height: 24px;
      user-select: none;
      word-break:keep-all;
    }
    .select-options{
      height: 24px;
      position: relative;
      text-align: left;
      .selected-text{
        max-width: 100%;
        min-width: 60px;
        height: 24px;
        line-height: 24px;
        z-index: 555;
        font-size: var(--stay-text-subbody);
        font-weight: 700;
        color: var(--stay-black);
        position: relative;
        appearance:none;
        -moz-appearance:none;
        -webkit-appearance:none;
        overflow: hidden;
        text-overflow: ellipsis;
        display: inline-block;
        -webkit-box-orient: vertical;
        padding-right: 16px;
        text-align: center;
        &::after{
          background: url("@/assets/popup/dropdown.png") no-repeat 50% 50%;
          background-size: 12px;
          content: "";
          position: absolute;
          right: 0;
          top: 50%;
          transform: translate(0, -50%);
          width: 12px;
          height: 12px;
        }
      }
      select.select-container{
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        position: absolute;
        background: transparent !important;
        color: transparent !important;
        z-index: 777;
      }
    }
    .select-options.folder{
      width: 140px;
      padding-right: 8px;
      position: relative;
      .selected-text{
        min-width: 80px;
      }
    }
    .quality{
      width: 80px;
    }
  }
  
}
@media (prefers-color-scheme: dark) {
  .sniffer-item{
    .item-download-info{
      .select-options{
        .selected-text{
          &::after{
            filter: drop-shadow(var(--stay-black) -12px 0);
            border-left: 12px solid transparent;
            overflow: hidden;
            right: -12px;
            transform: translateZ(0px);
            top: 6px;
          }
        }
      }
    }
  }

}
</style>