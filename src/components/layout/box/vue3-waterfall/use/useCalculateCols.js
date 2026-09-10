/*
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
 */
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { getItemWidth } from '../utils/itemWidth'

// props
//     breakpoints: Breakpoints
//     width: number
//     posDuration: number
//     animationDuration: number
//     animationDelay: number
//     animationEffect: string
//     hasAroundGutter: boolean
//     gutter: number
//     list: ViewCard[]
//     filter: {width:0,height: 0}
//     animationPrefix: string
//     align: string
export function useCalculateCols(props) {
  const wrapperWidth = ref(0)
  const waterfallWrapper = ref(null)
  

  const useResizeObserver = (target, callback) => {
    const observer = new ResizeObserver(entries => (callback(entries)));
  
    onMounted(() => {
      observer.observe(target.value);
    });
  
    onUnmounted(() => {
      // 在组件卸载时调用 disconnect() 方法断开监听
      if(observer){
        observer.disconnect();
      }
    });
  }

  useResizeObserver(waterfallWrapper, (entries) => {
    const entry = entries[0]
    const { width } = entry.contentRect
    wrapperWidth.value = width

  })

  // 列实际宽度
  const colWidth = computed(() => {
    return getItemWidth({
      wrapperWidth: wrapperWidth.value,
      breakpoints: props.breakpoints,
      gutter: props.gutter,
      hasAroundGutter: props.hasAroundGutter,
      initWidth: props.width,
    })
  })

  // 列
  const cols = computed(() => {
    const offset = props.hasAroundGutter ? -props.gutter : props.gutter
    return Math.floor((wrapperWidth.value + offset) / (colWidth.value + props.gutter))
  })

  // 偏移
  const offsetX = computed(() => {
    // 左对齐
    if (props.align === 'left') {
      return 0
    }
    else if (props.align === 'center') {
      // 居中
      const offset = props.hasAroundGutter ? props.gutter : -props.gutter
      const contextWidth = cols.value * (colWidth.value + props.gutter) + offset
      return (wrapperWidth.value - contextWidth) / 2
    }
    else {
      const offset = props.hasAroundGutter ? props.gutter : -props.gutter
      const contextWidth = cols.value * (colWidth.value + props.gutter) + offset
      return (wrapperWidth.value - contextWidth)
    }
  })

  return {
    waterfallWrapper,
    wrapperWidth,
    colWidth,
    cols,
    offsetX,
  }
}
