<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Popup from './view/Popup.vue'
import SidePannel from './view/SidePannel.vue'

const currentPath = ref(location.hash || '#popup')

watch(() => location.hash, () => {
  currentPath.value = location.hash || '#popup'
})

onMounted(() => {
  if (currentPath.value === '#sidepannel') {
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  }
})
</script>

<template>
  <SidePannel v-if="currentPath==='#sidepannel'" />
  <Popup v-else />
</template>

<style lang="less">
html, body, #app {
  height: 100%;
  margin: 0;
}
</style>
