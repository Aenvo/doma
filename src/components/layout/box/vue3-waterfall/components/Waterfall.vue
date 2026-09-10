<!--
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
-->
<template>
  <div ref="waterfallWrapper" class="waterfall-list" :style="{ height: `${wrapperHeight}px` }">
    <template v-for="(item, index) in list">
      <div
        :key="getKey(item, index)"
        v-if="filterImage(item.width, item.height)"
        class="waterfall-item"
      >
        <div class="waterfall-card" >
          <slot name="item" :item="item" :index="index" :url="getRenderURL(item)" />
        </div>
      </div>
    </template>
    <DaisyLoading :size="0.4" :style="{position: 'absolute', zIndex: '999',width:'60px', height: '60px', top: '40px', left: '50%', transform: 'translateX(-50%)'}" :active="loading" v-show="loading"></DaisyLoading>
    <div class="filter-null" v-if="showFilterNull">{{ $t("filter_null") }}</div>
  </div>
</template>

<script>
import { defineComponent, nextTick, onMounted, provide, ref, watch, reactive, computed } from 'vue'
import DaisyLoading from '@/components/layout/box/DaisyLoading.vue';
import { useCalculateCols, useLayout } from '../use'
import Lazy from '../utils/Lazy'
import { getValue, assign, filterImagesWithReact } from '../utils/util'
import { debounce } from '@/utils/RateLimiter'
export default defineComponent({
  props: {
    list: {
      type: Array,
      default: () => [],
    },
    filter: { // 过滤图片大小
      type: Object,
      default: () => ({
        width: 0,
        height: 0,
        operator: ">="
      })
    },
    rowKey: {
      type: String,
      default: 'id',
    },
    imgSelector: {
      type: String,
      default: 'src',
    },
    width: {
      type: Number,
      default: 200,
    },
    breakpoints: {
      type: Object,
      default: () => ({
        1200: {
          // when wrapper width < 1200
          rowPerView: 6,
        },
        800: {
          // when wrapper width < 800
          rowPerView: 4,
        },
        500: {
          // when wrapper width < 500
          rowPerView: 2,
        },
      }),
    },
    gutter: {
      type: Number,
      default: 10,
    },
    hasAroundGutter: {
      type: Boolean,
      default: true,
    },
    posDuration: {
      type: Number,
      default: 300,
    },
    animationPrefix: {
      type: String,
      default: 'animate__animated',
    },
    animationEffect: {
      type: String,
      default: 'fadeIn',
    },
    animationDuration: {
      type: Number,
      default: 1000,
    },
    animationDelay: {
      type: Number,
      default: 300,
    },
    backgroundColor: {
      type: String,
      default: 'transparent',
    },
    cardBackground: {
      type: String,
      default: 'var(--stay-backgroundSecondary)',
    },
    cardRadius:{
      type: String,
      default: '0px',
    },
    lazyload: {
      type: Boolean,
      default: true,
    },
    loadProps: {
      type: Object,
      default: () => ({}),
    },
    crossOrigin: {
      type: Boolean,
      default: true,
    },
    delay: {
      type: Number,
      default: 300,
    },
    align: {
      type: String,
      default: 'center',
    },
  },
  components:{
    DaisyLoading
  },
  setup(props, ctx) {
    assign(props.loadProps, {filter: props.filter, width: props.width, gutter: props.gutter})

    const cardWidth = ref(0);
    const loading = ref(false);
    const showFilterNull = ref(false);
    provide('cardWidth', cardWidth)
    const lazy = new Lazy(props.lazyload, props.loadProps, props.crossOrigin)
    provide('lazy', lazy)
    // 容器块信息
    const {
      waterfallWrapper,
      wrapperWidth,
      colWidth,
      cols,
      offsetX,
    } = useCalculateCols(props)

    const provideCardWidth = (value) => {
      // console.log("-------provideCardWidth------", value)
      cardWidth.value = value;
    }

    const filterImage = computed(() => (width, height) => {
      const imgReact = {width, height};
      const filter = props.filter;
      return filterImagesWithReact(imgReact, filter);
    
  })

    // 容器高度，块定位
    const { wrapperHeight, layoutHandle } = useLayout(
      props,
      colWidth,
      cols,
      offsetX,
      waterfallWrapper,
    )

    // 1s内最多执行一次排版，减少性能开销
    const renderer = debounce(() => {
      // console.log("startRender-----")
      layoutHandle().then((res) => {
        loading.value = false;
        // console.log("afterRender-----")
        if(!res){
          showFilterNull.value = true;
        }else{
          showFilterNull.value = false;
        }
        ctx.emit('afterRender')
      })
    }, props.delay)

    // 列表发生变化直接触发排版
    watch(
      () => [wrapperWidth, colWidth, props.list, props.filter],
      ([newWrapperWidth, newColWidth, newList, newFilter]) => {
        if (newWrapperWidth.value > 0) renderer()
        if (newColWidth.value > 0 ) provideCardWidth(colWidth.value)
        if(newFilter.width != props.filter.width || newFilter.height != props.filter.height || newFilter.operator != props.filter.operator){
          loading.value = true
          renderer()
          checkCarkAfterFilterRatio();
        }
      },
      { deep: true },
    )

    const checkCarkAfterFilterRatio = () => {
      const waterfallItemList = waterfallWrapper.value.querySelectorAll(".waterfall-item");
      // console.log("waterfallItemList----", waterfallItemList);
      if(waterfallItemList && waterfallItemList.length){
        showFilterNull.value = false;
      }else{
        showFilterNull.value = true;
      }
    }

    // 尺寸宽度变化防抖触发
    const sizeChangeTime = ref(0)

    // watchDebounced(colWidth, () => {
    //   layoutHandle()
    //   sizeChangeTime.value += 1
    // }, { debounce: props.delay })

    provide('sizeChangeTime', sizeChangeTime)

    // 图片加载完成
    provide('imgLoaded', renderer)

    /**
     * 根据选择器获取图片地址
     * item : {
     *          src: any
     *          id?: string
     *          name?: string
     *          star?: boolean
     *          backgroundColor?: string
     *          [attr: string]: any
     *        }
     */
    const getRenderURL = (item) => {
      return getValue(item, props.imgSelector)[0]
    }

    /**
     * 获取唯一值
     * item : {
     *          src: any
     *          id?: string
     *          name?: string
     *          star?: boolean
     *          backgroundColor?: string
     *          [attr: string]: any
     *        }
     */
    const getKey = (item, index) => {
      return item[props.rowKey] || index
    }

    return {
      filterImage,
      waterfallWrapper,
      wrapperHeight,
      getRenderURL,
      getKey,
      renderer,
      loading,
      showFilterNull
    }
  },
})
</script>

<style lang="less" scoped>
.waterfall-list {
  width: 100%;
  position: relative;
  overflow: hidden;
  background-color: v-bind(backgroundColor);
  .filter-null{
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: var(--stay-text-subbody);
    color: var(--stay-secondaryFont);
  }
}
.waterfall-item {
  position: absolute;
  left: 0;
  top: 0;
  /* 初始位置设置到屏幕以外，避免懒加载失败 */
  transform: translate3d(0, 3000px, 0);
  visibility: hidden;
  background-color: v-bind(cardBackground);
  border-radius: v-bind(cardRadius);
  overflow: hidden;
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.1); 
  border: 1px solid var(--stay-border);
}
.waterfall-item::before{
  overflow: hidden;
  border-radius: v-bind(cardRadius);
}
.animate__animated {
  animation-fill-mode: both;
  animation-duration: 1s;
}

/* 初始的入场效果 */
@-webkit-keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
.fadeIn {
  -webkit-animation-name: fadeIn;
  animation-name: fadeIn;
}
</style>
