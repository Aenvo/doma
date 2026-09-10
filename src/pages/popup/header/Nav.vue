<template>
  <div class="nav-wrapper" v-if="navList && navList.length">
    <div
      class="nav-item"
      v-for="(nav, index) in navList"
      :key="index"
      @click="navActionClick(nav)"
      :class="{ active: showNavId == nav.id }"
      v-show="!nav.disabled"
      >
      <div class="nav-text">{{ navTextName(nav.text) }}</div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
import {
  defineEmits,
  defineProps,
  reactive,
  ref,
  toRefs,
  watch,
  computed
} from 'vue';
import { useI18n } from 'vue-i18n';
import { isMobile } from "@/utils/device";

const emit = defineEmits(['change'])
const { t } = useI18n();
const props = defineProps({
  list: {
    type: Array,
    default: ()=>{[]}
  },
  activatedId: {
    type: String,
    default: ''
  }
})
const platformName = import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME;
const state = reactive({
  showNavId: props.activatedId,
  platform: platformName
})
const { showNavId } = toRefs(state);
const navList = ref(props.list);
watch([() => props.list, () => props.activatedId], ([newList, newActivatedId]) => {
  navList.value = newList;
  state.showNavId = newActivatedId;
  // if(state.showNavId == "videos" && !isMobile()){
  //   state.showNavId = "files";
  // }
});


const navActionClick = (nav) => {
  state.showNavId = nav.id;
  emit('change', nav)
}

const navTextName = computed(()=>(navText)=>{ 
  if(navText == "videos"){
    if(state.platform == "StayBrowser_Android"){
      return t('resource_videos');
    }else{
      return t('videos');
    }
  }else{
    return t(`${navText}`)
  }
  
})

</script>
<style lang="less" scoped>
.nav-wrapper{
  width: 100%;
  padding: 0px 10px;
  height: 30px;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  position: relative;
  .nav-item{
    padding: 0px 15px;
    text-align: center;
    height: 28px;
    cursor: pointer;
    position: relative;
    color: var(--stay-secondaryFont);
    font-weight: 600;

    .nav-text{
      height: 100%;
      font-size: var(--stay-text-subheadline);
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    &.active{
      background-color: var(--stay-border);
      color: var(--stay-black);
      border-radius: 14px;
      // .nav-text::after{
      //   content: '';
      //   width: 65%;
      //   height: 2px;
      //   background-color: var(--s-main);
      //   position: absolute;
      //   bottom: -1px;
      //   left: 50%;
      //   transform: translateX(-50%);
      // }
    }
  }
}
</style>
