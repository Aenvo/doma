<template>
  <div class="tab-bar-box">
    <a class="tab-item" v-for="(item, index) in menuList" 
      :key="index" 
      :href="item.path" 
      :class="{'active': currentPath === item.path}" 
      @click="updateCurrentPath(item)" v-show="item.enabled">
      <component :is="item.icon" class="icon" />
    </a>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { hashName } from '@/utils/url'
import type { MenuItem } from '@/types/MenuTypes'
import { ref, shallowRef, onUnmounted, onMounted } from 'vue'

// 组件本身不需要响应式跟踪，因为它们通常不会发生变化。可以使用 markRaw 来标记组件，使其不会被变成响应式对象。
const { t } = useI18n();
const emit = defineEmits(['change'])
const menuList = ref([
  {
    icon: shallowRef(""),
    title: t("bookmarks"),
    path: '#bookmarks',
    key: "bookmarks",
    enabled: true,
  },
  {
    icon: shallowRef(""),
    title: t("contentBlock"),
    path: '#contentBlock',    
    key: "contentBlock",  
    enabled: true,
  },
  {
    icon: shallowRef(""),
    title: t("settings"),
    path: '#settings', 
    key: "settings",   
    enabled: true,
  }
])

const currentPath = ref(hashName() || '#bookmarks')

const updateCurrentPath = (menu: MenuItem) => {
  currentPath.value = menu.path;
  emit("change", menu.path)
};

const handler = () => {
  console.log('menu---handler----[Hash Change]-----', location.hash);
  const path = hashName();
  if(path && path == "#"){
    currentPath.value = "#bookmarks";
  }else{
    currentPath.value = hashName();
  }
  
  emit("change", currentPath.value)
  console.log('menu---handler----currentPath.value---', currentPath.value);
};


onMounted(() => {
  handler(); // 初始化执行
  window.addEventListener('hashchange', handler);
  
});

onUnmounted(() => {
  window.removeEventListener('hashchange', handler);
});

</script>
<style scoped lang="less">
.tab-bar-box{
  width: 100%;
  background-color: var(--stay-background);
  height: 60px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  // gap: 5px;
  // padding: 10px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;

  z-index: 999;
  .tab-item{
    width: 25%;
    // height: 40px;
    display: flex;
    // flex-direction: row;
    align-items: center;
    justify-content: center;
    // gap: 10px;
    // padding: 5px 10px;
    // border-radius: 10px;
    // transition: all .3s ease;
    &.active{
      .icon{
        font-size: var(--stay-text-body);;
        & * {
          fill: var(--s-main);
        }
        
      }
    }
    
    .icon{
      scale: 1.3;
      font-size: var(--stay-text-body);;
      & * {
        fill: var(--stay-secondaryFont);
      }
      
    }
    .title{
      color: var(--stay-black);
      font-size: var(--stay-text-headline);
      font-weight: 700;
    }
  }
}
</style>