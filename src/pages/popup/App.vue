<script setup lang="ts">
import { ref, watch } from 'vue'
// import Button from '@/components/layout/box/Button.vue'
// import { getContext } from '@/services/Context';
import Popup from './view/Popup.vue'
import SidePannel from './view/SidePannel.vue'


// #sidepanel, #popup
const currentPath = ref(location.hash || '#popup')
console.log('Current path:', currentPath.value);
watch(() => location.hash, (newHash) => {
  currentPath.value = newHash;
  console.log('New hash:', newHash); // 可用于调试，确认 hash 值是否正确更新
})



</script>

<template>
  <SidePannel v-if="currentPath=='#sidepannel'" />
  <Popup v-else />
</template>

<style lang="less" scoped>

</style>
