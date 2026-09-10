<template>
  <div class="menu-box">
    <a class="menu-item" v-for="(item, index) in menuList" 
      :key="index" 
      :href="item.path" 
      :class="{'active': currentPath === item.path}" 
      @click="updateCurrentPath(item)" v-show="item.enabled">
      <component :is="item.icon" class="icon" />
      <span class="title">{{ item.title }}</span>
    </a>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { hashName } from '@/utils/url'
import type { MenuItem } from '@/types/MenuTypes'
import { ref, shallowRef, onUnmounted, onMounted } from 'vue'
import { isMobileLite } from '@/utils/feature'

// 组件本身不需要响应式跟踪，因为它们通常不会发生变化。可以使用 markRaw 来标记组件，使其不会被变成响应式对象。
const { t } = useI18n();
const emit = defineEmits(['change'])
const menuList = ref([
  {
    icon: shallowRef(""),
    title: t("home"),
    path: '#',
    key: "home",
    enabled: !isMobileLite(),
  },
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

const currentPath = ref(hashName())

const updateCurrentPath = (menu: MenuItem) => {
  currentPath.value = menu.path;
  emit("change", menu.path)
};

const handler = () => {
  console.log('menu---handler----[Hash Change]-----', location.hash);
  currentPath.value = hashName();
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
.menu-box{
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  gap: 2px;
  padding: 10px;
  .menu-item{
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: start;
    gap: 10px;
    padding: 5px 10px;
    border-radius: 10px;
    transition: all .3s ease;
    &.active{
      background-color: var(--stay-border);
    }
    &:hover{
      background-color: var(--stay-border);
    }
    .icon{
      font-size: var(--stay-text-body);;
      & * {
        fill: var(--stay-black);
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