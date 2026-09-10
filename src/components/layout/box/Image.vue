<template>
  <img v-if="src && typeof src === 'string'" :src="src" :class="[$attrs.class, $attrs[':class']]" v-bind="$attrs">
  <component v-else :is="src" :class="[$attrs.class, $attrs[':class']]" v-bind="$attrs" />
</template>
<script setup lang="ts">
// import { defineProps } from 'vue' 
// defineOptions({
//   inheritAttrs: false
// })
defineProps({
  src: {
    type: [String, Object],
    default: ''
  }
  
})

// Your script code here
</script>
<style scoped lang="less">
/* Your style code here */
</style>