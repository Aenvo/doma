<!--
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
-->

<template>
  <div class="lazy__box">
    <div class="lazy__resource">
      <img ref="lazyRef" class="lazy__img" :title="title" :alt="alt" @load="imageLoad">
    </div>
    <div class="size-text" v-if="showSize">{{imgWidth}} <span>x</span> {{imgHeight}}</div>
  </div>
</template>

<script>
import { defineComponent, inject, watch, watchEffect, reactive, onMounted, toRefs, onUnmounted, ref, nextTick } from 'vue'

export default defineComponent({
  props: {
    url: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      default: '',
    },
    alt: {
      type: String,
      default: '',
    },
    item: {
      type: Object,
      default: ()=>{},
    }
  },
  setup(props, ctx) {
    const imgLoaded = inject('imgLoaded')
    let lazy = inject('lazy');
    const cardWidth = inject("cardWidth");
    const lazyRef = ref(null)
    const state = reactive({
      showSize: false,
      imgWidth: 0,
      imgHeight: 0,
      cardWidth: 172.5,
    });

    if(cardWidth.value > 0){
      state.cardWidth = cardWidth.value;
      // console.log("--------------Provided---cardWidth---------", cardWidth.value)
    }
    
    const render = () => {
      // console.log("lazy-img-----render")
      if (!lazyRef.value)
        return
      // console.log("lazyImg-----props-------", props, lazy)
      lazy.mount(lazyRef.value, props, state.cardWidth, (status, showSize, imgWidth, imgHeight) => {
        // 图片加载完成做card排版
        imgLoaded()
        if (status){
          ctx.emit('success', props.url)
          state.showSize = showSize;
          state.imgWidth = imgWidth;
          state.imgHeight = imgHeight;
        }else{
          ctx.emit('error', props.url)
        }
      })
    }

    onMounted(() => {
      render()
    })

    // watchEffect(() => {
    //   if (lazy) {
    //     console.log('--------lazy.options有值:', lazy.options);
    //     render()
    //   } else {
    //     console.log('-------------lazy为undefined');
    //   }
    // });

    // watch(
    //   () => isProvidedLazy, // 监听的目标
    //   (newValue, oldValue) => { // 回调函数
    //     if (newValue) {
    //       console.log('isProvidedLazy', newValue);
    //       render()
    //     } else {
    //       console.log('lazy isProvidedLazy is false');
    //     }
    //   },
    //   { immediate: true, deep: true }
    // );

    function unRender() {
      if (!lazyRef.value)
        return

      lazy.unmount(lazyRef.value)
    }

    function imageLoad() {
      ctx.emit('load', props.url)
    }

    

    onUnmounted(() => {
      unRender()
    })

    return {
      lazyRef,
      imageLoad,
      ...toRefs(state)
    }
  },
})
</script>

<style lang="less" scoped>
.lazy__box {
  width: 100%;
  height: 0;
  padding-bottom: 100%;
  overflow: hidden;
  position: relative;
}

.lazy__resource {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
}
.size-text{
  position: absolute;
  bottom: 0;
  left: 0;
  height: 30px;
  line-height: 30px;
  font-size: var(--stay-text-subbody);
  font-weight: 600;
  width: 100%;
  text-align: center;
  z-index: 999;
  color: var(--stay-black);
  span{
    font-size: 12px;
    font-weight: 400;
  }
}

.lazy__img {
  display: block;
}

.lazy__img[lazy="loading"] {
  padding: 5em 0;
  width: 48px;
  width: 48px;
}

.lazy__img[lazy="loaded"] {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.lazy__img[lazy="error"] {
  padding: 5em 0;
  width: 48px;
  height: auto;
}
</style>
