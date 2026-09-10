<template>
  <div class="header-wrapper">
    <Splite @click="handleSpliteCollapsed"></Splite>
  </div>
  
</template>
<script setup lang="ts">
import Splite from '@/components/layout/header/Splite.vue'
const emit = defineEmits(['collapsed'])
const handleSpliteCollapsed = (collapsed:boolean) => {
  emit('collapsed', collapsed)
}
</script>
<style scoped lang="less">
.header-wrapper{
  width: 100%;
  height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
}

</style>
