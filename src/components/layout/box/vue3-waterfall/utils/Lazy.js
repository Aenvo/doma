/*
 * @Author: Stay
 * @Date: 2024-03-14 15:00:00
 * @LastEditors: Turbo
 * @LastEditTime: 2024-03-14 15:00:00
 */

import { assign, hasIntersectionObserver, isObject, filterImagesWithReact } from './util'
import { add, mul, div } from "@/utils/operation"
import { loadImage } from './loader'
import DEFAULT_LOADING from '../img/loading.png'
import DEFAULT_ERROR from '../img/error.png'

const LifecycleEnum = {
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
}

const DEFAULT_OBSERVER_OPTIONS = {
  rootMargin: '0px',
  threshold: 0,
}


export default class Lazy {
  lazyActive = true // 是否开启懒加载
  crossOrigin = true // 开启跨域
  options = {
    loading: DEFAULT_LOADING,
    error: DEFAULT_ERROR,
    observerOptions: DEFAULT_OBSERVER_OPTIONS,
    showSize: true, // 图片下方显示像素大小
    filter: { // 过滤图片大小
      width: 0,
      height: 0,
      operator: ">="
    },
    gutter: 10,
    log: true,
    ratioCalculator: (width, height) => {return div(height, width)},
  }

  _images = new WeakMap()

  /**
   * @param {*} flag
   * @param {*} options
   * error?: string
   * loading?: string
   * observerOptions?: IntersectionObserverInit
   * log?: boolean
   * ratioCalculator?: (width, height) => height / width
   * @param {*} crossOrigin
   */
  constructor(flag = true, options, crossOrigin = true) {
    this.lazyActive = flag
    this.crossOrigin = crossOrigin
    this.config(options)
  }

  config(options = {}) {
    assign(this.options, options)
    // console.log("this.options----", this.options, options.ratioCalculator)
    options.ratioCalculator && (this.options.ratioCalculator = options.ratioCalculator)
    // console.log("this.options----", this.options, this.options.ratioCalculator)
  }

  // mount
  // el: HTMLImageElement, binding: string | {src: string, error?: string, loading?: string}, callback: CallbackFunction
  mount(el, binding, cardWidth, callback) {
    // console.log("mount---start-------", el, binding, cardWidth)
    const { src, item, loading, error } = this._valueFormatter(binding)
    el.setAttribute('lazy', LifecycleEnum.LOADING)
    el.setAttribute('src', loading || DEFAULT_LOADING)
    if (!this.lazyActive) {
      this._setImageSrc(el, src, cardWidth, item, callback, error)
    }
    else {
      // 懒加载
      if (!hasIntersectionObserver) {
        this._setImageSrc(el, src, cardWidth, item, callback, error)
        this._log(() => {
          throw new Error('Not support IntersectionObserver!')
        })
      }
      this._initIntersectionObserver(el, src, cardWidth, item, callback, error)
    }
  }

  // resize
  resize(el, callback) {
    const lazy = el.getAttribute('lazy')
    const src = el.getAttribute('src')
    if (lazy && lazy === LifecycleEnum.LOADED && src) {
      loadImage(src, this.crossOrigin).then((image) => {
        const { width, height } = image
        const curHeight = (el.width / width) * height
        el.height = curHeight
        const style = el.style
        style.height = `${curHeight}px`
        callback && callback(true, this.options.showSize, width, height)
      })
    }
  }

  // unmount, el: HTMLElement
  unmount(el) {
    const imgItem = this._realObserver(el)
    imgItem && imgItem.unobserve(el)
    this._images.delete(el)
  }

  calcImageSizeAndPosition(el, width, height, cardWidth, src, callback){
    let imgSizeTextHeight = 0;
    // 是否展示图片像素信息,留出展示尺寸信息高度
    if(this.options.showSize){
      imgSizeTextHeight = 30
    }
    const lazyResource = el.parentNode;
    lazyResource.style.marginBottom = `${imgSizeTextHeight}px`

    // 最终计算图片展示区域的宽高比
    let divA = add(imgSizeTextHeight, height); // 被除数
    let divB = width;  // 除数

    let ratio = this.options.ratioCalculator?.(divB, divA) || div(divA, divB);

    // console.log("this.options-------loadImage---ratio-----", ratio, item)
    const lazyBox = el.parentNode && el.parentNode.parentNode
    
    
    const gutter = this.options.gutter; // 间距
    // 如果是高宽比大于1，则判断图片实际高度是否小于卡片的width
    if(ratio >= 1){
      // console.log("loadImage---this.options-----", item, this.options, cardWidth)
      // 图片高度小于卡片宽度，需要重新计算高宽比，以保证每个卡片内图片间距是一样的
      if(divB < cardWidth){
        if(divB <= cardWidth/2){
          divA = add(divA, 2*gutter)
        }
        divB = cardWidth
      }
    }
    // 如果有展示图片的尺寸信息，则需要预留高度出来，故在被除数的基础上要加上展示尺寸信息高度
    ratio = div(divA, divB);

    // 设置最小高度
    let minRatio = div(2*imgSizeTextHeight, cardWidth);
    if(ratio < minRatio){
      ratio = minRatio;
    }
    
    let paddingBottom = `${mul(ratio, 100)}%`;
    // console.log("loadImage---this.options---ratio--", item, ratio, paddingBottom)
    lazyBox.style.paddingBottom = paddingBottom
    // 设置图片
    el.setAttribute('lazy', LifecycleEnum.LOADED)
    el.removeAttribute('src')
    el.setAttribute('src', src)

    callback(true, this.options.showSize, width, height)
  }

  /**
   * 设置img的src
   * @param {HTMLImageElement} el - img
   * @param {string} src - 原图
   * @param {Number} cardWidth - 展示图片的卡片宽度
   * @param {Object} item - 展示卡片信息
   * @param {string} error - 错误图片
   * @param {CallbackFunction} callback - 完成的回调函数，通知组件刷新布局
   * @returns
   */
  _setImageSrc(el, src, cardWidth, item, callback, error) {
    if (!src)
      return

    const preSrc = el.getAttribute('src')
    // console.log("_setImageSrc----", preSrc, src);
    if (preSrc === src)
      return

    if(item.width && item.width > 0 && item.height && item.height > 0){
      this.calcImageSizeAndPosition(el, item.width, item.height, cardWidth, src, callback)
    }else{

      loadImage(src, this.crossOrigin).then((image) => {
        // 修改容器
        const { width, height } = image
        if(!item.width || item.width<=0){
          item.width = width;
        }
        if(!item.height || item.height<=0){
          item.height = height;
        }
  
        // 不符合过滤条件
        const imgReact = {width: item.width, height: item.height}
        if(!filterImagesWithReact(imgReact, this.options.filter)){
          callback(true, this.options.showSize, item.width, item.height)
          // item.objectUrl = url;
          return;
        }
        
        this.calcImageSizeAndPosition(el, item.width, item.height, cardWidth, src, callback)
  
      })
      .catch(() => {
        const imgItem = this._realObserver(el)
        imgItem && imgItem.disconnect()
        if (error) {
          el.setAttribute('lazy', LifecycleEnum.ERROR)
          el.setAttribute('src', error)
          callback(false)
        }
        this._log(() => {
          throw new Error(`Image failed to load!And failed src was: ${src} `)
        })
      })
    }

  }

  _isOpenLazy() {
    return hasIntersectionObserver && this.lazyActive
  }

  /**
   * 添加img和对应的observer到weakMap中
   * 开启监听
   * 当出现在可视区域后取消监听
   * @param {HTMLImageElement} el - img
   * @param {string} src - 图片
   * @param {Number} cardWidth - 展示图片的卡片宽度
   * @param {Object} item - 展示卡片信息
   * @param {string} error - 错误图片
   * @param {CallbackFunction} callback - 完成的回调函数，通知组件刷新布局
   */
  _initIntersectionObserver(el, src, cardWidth, item, callback, error) {
    const observerOptions = this.options.observerOptions
    this._images.set(
      el,
      new IntersectionObserver((entries) => {
        Array.prototype.forEach.call(entries, (entry) => {
          if (entry.isIntersecting) {
            const imgItem = this._realObserver(el)
            imgItem && imgItem.unobserve(entry.target)
            this._setImageSrc(el, src, cardWidth, item, callback, error)
          }
        })
      }, observerOptions),
    )

    const imgItem = this._realObserver(el)
    imgItem && imgItem.observe(el)
  }

  // 格式化参数 value string | LazyProps
  _valueFormatter(value) {
    let src = value
    let loading = this.options.loading
    let error = this.options.error
    let item = {}
    if (isObject(value)) {
      src = value.url
      item = value.item;
      loading = value.loading || this.options.loading
      error = value.error || this.options.error
    }
    return {
      src,
      item,
      loading,
      error,
    }
  }

  // 日志
  _log(callback) {
    if (this.options.log)
      callback()
  }

  // 在map中获取对应img的observer事件
  _realObserver(el) {
    return this._images.get(el)
  }
}
