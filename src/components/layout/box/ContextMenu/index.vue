<template>
  <div @contextmenu.prevent="handleContextMenu" @click.stop="handleClickContextMenu">
    <slot></slot>
    <component :is="ContextMenuComponent" 
      v-model:show="show"
      v-model:options="options"
    >
      
    </component>
  </div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent, watch } from 'vue'
// https://docs.imengyu.top/vue3-context-menu-docs/api/ContextMenuInstance.html#menuoptions
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import "./contextmenu.less"
import type { MenuOptions, MenuItem } from '@imengyu/vue3-context-menu'
// 异步导入组件
const ContextMenuComponent = defineAsyncComponent(() => 
  import('@imengyu/vue3-context-menu').then(m => m.ContextMenu)
)
const emit = defineEmits(['contextmenu'])
const props = defineProps({
  target: {
    type: String,
    default: 'context'
  },
  items: {
    type: Array<MenuItem>,
    required: true,
    default: () => []
  },
})
const options = ref<MenuOptions>({
  theme: 'mac',
  zIndex: 2147483647,
  maxWidth: 260,
  minWidth: 160,
  mouseScroll: true,
  updownButtonSpaceholder: false,
  adjustPadding: 0,
  x: 0,
  y: 0,
  items: props.items as MenuItem[],
});

watch(() => props.items, (newItems) => {
  // console.log("watch---props------", newProps);
  options.value = {...(options.value as MenuOptions), items: newItems as MenuItem[]  }
  // console.log("watch---options.value------",options.value);
}, { immediate: true, deep: true })

const show = ref(false)

const handleContextMenu = (e: MouseEvent) => {
  if(show.value == true){
    show.value = false;
    return;
  }
  e.preventDefault()
  emit('contextmenu', e)
  options.value = { ...(options.value as MenuOptions), x: e.clientX, y: e.clientY }
  show.value = true
  console.log("options.value------",options.value);
  // ContextMenu.showContextMenu({
  //   ...(options.value as MenuOptions)
  // }); 
}

const handleClickContextMenu = (e: MouseEvent) => {
  if(props.target === 'click'){
    handleContextMenu(e);
  }
}



</script>

<style scoped lang="less">

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>