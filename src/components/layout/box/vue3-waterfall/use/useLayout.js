/*
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
 */
import { ref } from 'vue'
import { addClass, hasClass, prefixStyle } from '../utils/dom'

const transform = prefixStyle('transform')
const duration = prefixStyle('animation-duration')
const delay = prefixStyle('animation-delay')
const transition = prefixStyle('transition')
const fillMode = prefixStyle('animation-fill-mode')

// props: WaterfallProps, colWidth: Ref<number>, cols: Ref<number>, offsetX: Ref<number>, waterfallWrapper: Ref<Nullable<HTMLElement>>
export function useLayout(props, colWidth, cols, offsetX, waterfallWrapper) {
  const posY = ref([])
  const wrapperHeight = ref(0)

  // 获取对应y下标的x的值
  const getX = (index) => {
    const count = props.hasAroundGutter ? index + 1 : index
    return props.gutter * count + colWidth.value * index + offsetX.value
  }

  // 初始y
  const initY = () => {
    posY.value = new Array(cols.value).fill(props.hasAroundGutter ? props.gutter : 0)
  }

  // 添加入场动画
  const animation = addAnimation(props)

  // 排版
  const layoutHandle = async() => {
    return new Promise((resolve) => {
    // 初始化y集合
      initY()

      // 构造列表
      const items = []
      if (waterfallWrapper && waterfallWrapper.value) {
        waterfallWrapper.value.childNodes.forEach((el) => {
          if (el && el.className === 'waterfall-item')
            items.push(el)
        })
      }

      // 获取节点
      if (items.length === 0){
        resolve(false)
        return;
      } 

      // 遍历节点
      for (let i = 0; i < items.length; i++) {
        const curItem = items[i]
        // 最小的y值
        const minY = Math.min.apply(null, posY.value)
        // 最小y的下标
        const minYIndex = posY.value.indexOf(minY)
        // 当前下标对应的x
        const curX = getX(minYIndex)

        // 设置x,y,width
        const style = curItem.style

        // 设置偏移
        if (transform) style[transform] = `translate3d(${curX}px,${minY}px, 0)`
        style.width = `${colWidth.value}px`

        style.visibility = 'visible'

        // 更新当前index的y值
        const { height } = curItem.getBoundingClientRect()
        posY.value[minYIndex] += height + props.gutter

        // 添加入场动画
        animation(curItem, () => {
        // 添加动画时间
          const time = props.posDuration / 1000
          if (transition) style[transition] = `transform ${time}s`
        })
      }

      wrapperHeight.value = Math.max.apply(null, posY.value)

      setTimeout(() => {
        resolve(true)
      }, props.posDuration)
    })
  }

  return {
    wrapperHeight,
    layoutHandle,
  }
}

// 动画
function addAnimation(props) {
  return (item, callback) => {
    const content = item ? item.firstChild : ''
    if (content && !hasClass(content, props.animationPrefix)) {
      const durationSec = `${props.animationDuration / 1000}s`
      const delaySec = `${props.animationDelay / 1000}s`
      const style = content.style
      addClass(content, props.animationPrefix)
      addClass(content, props.animationEffect)

      if (duration)
        style[duration] = durationSec

      if (delay)
        style[delay] = delaySec

      if (fillMode)
        style[fillMode] = 'both'

      if (callback) {
        setTimeout(() => {
          callback()
        }, props.animationDuration + props.animationDelay)
      }
    }
  }
}
