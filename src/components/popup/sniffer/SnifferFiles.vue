<template>
  <div class="file-wrapper">
    <div class="sniffer-file-box" v-if="fileList && fileList.length">
      <SnifferItem v-for="(sniffer, index) in fileList" :folder="folderOptions" :key="index" type="file" :item="sniffer"></SnifferItem>
    </div>
    <SnifferNull :title="$t('sniffer_file_none')" :desc="$t('sniffer_file_none_prompt')" @contactAction="contactClick" @retryAction="retryAction" v-else></SnifferNull>
    <DaisyLoading :size="0.4" :style="{position: 'absolute', zIndex: '999',width:'60px', height: '60px', top: '40px', left: '50%', transform: 'translateX(-50%)'}" :active="snifferLoading" v-show="snifferLoading"></DaisyLoading>
  </div>
</template>
<script setup>
import { ref, reactive, defineEmits, inject, toRefs, watch, onUnmounted, defineProps } from 'vue'
import { useI18n } from 'vue-i18n';
import SnifferItem from './SnifferItem.vue';
import SnifferNull from './SnifferNull.vue';
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { getContext, getCurrentTab, openUrlInSafariPopup } from "@/services/Context"
// eslint-disable-next-line 
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

let snifferFileConnect = "";
const global = inject('global');
const store = global.store;
const browserUrl = ref('');
const state = reactive({
  snifferLoading: false,
  folderOptions: props.folder,
  selectedFolder: props.defaultFolder,
  fileList: [],
});

const { fileList, snifferLoading, folderOptions } = toRefs(state);

watch(
  props,
  (newProps) => {
    // 接收到的props的值
    state.folderOptions = newProps.folder;
    state.selectedFolder = newProps.defaultFolder;
    // console.log("state.selectedFolder-----",state.selectedFolder)
  },
  { immediate: true, deep: true }
);

onUnmounted(()=>{
  snifferFileConnect.postMessage({operate: 'disconnectAndDestroy'});
  snifferFileConnect = "";
})

const contactClick = () => {
  openUrlInSafariPopup(`mailto:feedback@fastclip.app?subject=${t('sniffer_file_none')}&body=${encodeURIComponent(browserUrl.value)}`);
}

const retryAction = () => {
  console.log("retryAction start")
  if(state.snifferLoading){
    return;
  }
  state.snifferLoading = true;
  if(snifferFileConnect){
    console.log("retryAction, has snifferFileConnect");
    try {
      snifferFileConnect.postMessage({operate: 'snifferFetchFileInfoFromPopup'})
    } catch (error) {
      let timer = setTimeout(()=>{
        state.snifferLoading = false;
        clearTimeout(timer);
        timer = ""
        snifferFileConnect = ""
      }, 1000)
      
    }
  }else{
    console.log("retryAction, no snifferFileConnect");
    createSnifferFileConnectToListenerInfo()
  }
}

const createSnifferFileConnectToListenerInfo = () => {
  getCurrentTab((url, tabId) => {
    console.log('global.getCurrentTabId--------',tabId);
    snifferFileConnect = getContext().browser.tabs.connect(tabId, {name: 'POPUP_SNIFFER_FILE_CONNECT'});
    // const pid = Math.random().toString(36).substring(2, 9);
    console.log("snifferFileConnect  create------", typeof snifferFileConnect, snifferFileConnect);
    snifferFileConnect.postMessage({operate: 'snifferFetchFileInfoFromPopup'});
    // console.log("snifferFileConnect---postMessage----snifferFetchFileInfoFromPopup--");
    snifferFileConnect.onMessage.addListener((message) => {
      state.snifferLoading = false;
      console.log('snifferFileConnect收到消息：----------------', message);
      const {operate, pageUrl, fileInfoList} = message;
      if('pushFileInfoToPopup' == operate){
        if(fileInfoList){
          // console.log("fileInfoList----", fileInfoList, state.selectedFolder);
          let fileList = fileInfoList;
          fileList.forEach(item=>{
            const hasItem = state.fileList.some(file => file.downloadUrl === item.downloadUrl);
            if(hasItem){
              return
            }

            item.selectedFolder = state.selectedFolder.uuid;
            item.selectedFolderText = state.selectedFolder.name;
            state.fileList.push(item)
          });
          console.log('state.fileList---------',state.fileList);
          // state.fileList = fileList;
        }else{
          state.fileList = [];
        }
      }
      return true;
    });
  })
}


createSnifferFileConnectToListenerInfo()

</script>
<style lang="less" scoped>
.file-wrapper{
  width: 100%;
  height: 100%;
  padding: 10px 0;
  position: relative;
  display: flex;
  flex: 1;
  .sniffer-file-box{
    padding: 0 0 0 10px;
    width: 100%;
  }
}
</style>