/*
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
 */

/**
 * @description: 获取当前窗口尺寸下格子的宽度
 * @param {ItemWidthProps} param1
 * ItemWidthProps {
 *   breakpoints: Breakpoints
 *   wrapperWidth: number
 *   gutter: number                 卡片之间的间隙
 *   hasAroundGutter: boolean       容器四周是否有 gutter 边距
 *   initWidth: number(cardWidth)
 * }
 * @return {*}
 */
export const getItemWidth = ({breakpoints, wrapperWidth, gutter, hasAroundGutter, initWidth}) => {
  // 获取升序尺寸集合
  const sizeList = Object.keys(breakpoints).map((key) => { return Number(key) }).sort((a, b) => a - b)

  // 获取当前的可用宽度
  let validSize = wrapperWidth
  let breakpoint = false
  for (const size of sizeList) {
    if (wrapperWidth <= size) {
      validSize = size
      breakpoint = true
      break
    }
  }

  // 非断点，返回设置的宽度
  if (!breakpoint)
    return initWidth

  // 断点模式，计算当前断点下的宽度
  const col = breakpoints[validSize] ? breakpoints[validSize].rowPerView : 2;
  if (hasAroundGutter)
    return (wrapperWidth - gutter) / col - gutter
  else
    return (wrapperWidth - (col - 1) * gutter) / col
}
