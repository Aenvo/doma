<template>
  <div class="video-parser-wrapper">
    <iframe id="parserIframe" :src="processedParserUrl" frameborder="0"></iframe>
  </div>
</template>
<script setup lang="ts">
import { getContext } from '@/services/Context';
import { ref, onMounted, nextTick, onUnmounted, watch, computed } from 'vue';

const props = defineProps({
  parserUrl: {
    type: String,
    default: ''
  }
})

const parserIframe = ref<HTMLIFrameElement|null>(null);

const processedParserUrl = computed(() => {
  if (!props.parserUrl) {
    return '';
  }
  
  const url = new URL(props.parserUrl);
  url.searchParams.set('stay_video_parser', 'true');
  return url.toString();
});

watch(() => props.parserUrl, (newUrl) => {
  if (newUrl && parserIframe.value) {
    parserIframe.value.src = processedParserUrl.value;
  }
});

</script>
<style scoped lang="less">
.video-parser-wrapper{
  width: 300px;
  height: 500px;
}
</style>
