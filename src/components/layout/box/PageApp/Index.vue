<template>
  <teleport to="#app">
    <transition name="fade">
      <div v-if="maskVisible" class="page-app-wrapper" @click.self="clickMaskAction" :style="{background: mask?'rgba(0, 0, 0, 0.1)':'transparent'}">
        <!-- :style="$attrs.style ? {width: width, ...$attrs.style} : { width: width }" -->
        <transition :name="animation" @after-leave="onBoxAfterLeave">
          <div v-if="boxVisible" :class="[$attrs.class, isMobile() || model=='mobile' ? 'mobile' : 'desktop']" :style="$attrs.style ? {...$attrs.style} : {}" class="page-app-box">
            <!-- head历史导航按钮 -->
            <div class="head-box">
              <div class="head-title" >
                <div class="back" @click="goBack" v-if="historyStack.length > backStart" ><BackSvg /></div>
                <span >{{ currentPage.props?.title || title }}</span>
              </div>
              <div class="close" v-if="showClose" @click="closeDialogAction" >
                <Image :src="CloseSvg" />
              </div>
            </div>
            
            <!-- 动态组件容器 -->
            <keep-alive>
              <component
                :is="currentPage.component"
                v-bind="currentPage.props"
                @navigate="handleNavigate"
                @back="goBack"
                @sync="handleSync"
                @close="closeDialogAction"
                @loading="handleLoading"
              />
            </keep-alive>
            <Loading :active="showLoading" class="loading-box" :text="loadingText" />
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick, type Component, type PropType } from 'vue'
import BackSvg from '@/assets/images/back.svg'
import Loading from '@/components/layout/box/Loading.vue';
import CloseSvg from "@/assets/images/close-outlined.svg";
import Image from "@/components/layout/box/Image.vue"
import { isMobile } from '@/utils/device';
import { useViewportManager } from '@/components/ViewportManager';
import { replaceHashName } from '@/utils/url';

const { manualReset, autoBlurInput } = useViewportManager('dialog', {
  hasInput: true,
  onKeyboardStateChange: (visible: boolean) => {
    // 可以在这里添加键盘状态变化时的自定义逻辑
    console.log('Keyboard visible:', visible);
  }
});

defineOptions({
  inheritAttrs: false
})
const emit = defineEmits(['update:show', 'close', 'sync'])
const props = defineProps({
  model:{
    type: String,
    default: "mobile" // mobile\desktop
  },
  backStart: {
    type: Number,
    default: 0
  },
  show: {
    type: Boolean,
    default: false
  },
  mask: {
    type: Boolean,
    default: true
  },
  maskClosable: {
    type: Boolean,
    default: true
  },
  animation: {
    type: String,
    default: 'push-to-right' // push-to-right: 水平向右推进，push-to-right: 水平向左推进，
    // push-to-top: 纵向向顶部推进，push-to-bottom: 纵向向底部推进
  },
  title: {
    type: String,
    default: 'new page'
  },
  showClose: {
    type: Boolean,
    default: false
  },
  initPage: {
    type: Object as PropType<{
      component: Component | string
      props?: Record<string, unknown>
    }>,
    required: true
  }
})

const showLoading = ref(false);
const loadingText = ref('');

const maskVisible = ref(false)
const boxVisible = ref(false)
const closingFromInside = ref(false);  // 标记：是组件内部触发关闭（点击 X / 点击遮罩）
const closingFromParent = ref(false);  // 标记：是父组件通过 props.show=false 触发关闭
const MASK_LEAVE_MS = 350
let maskCleanupTimer: ReturnType<typeof setTimeout> | null = null

const clearMaskCleanupTimer = () => {
  if (maskCleanupTimer) {
    clearTimeout(maskCleanupTimer)
    maskCleanupTimer = null
  }
}

/** after-leave 未触发时兜底卸遮罩，避免透明层挡住侧栏头像点击 */
const scheduleMaskCleanup = () => {
  clearMaskCleanupTimer()
  maskCleanupTimer = setTimeout(() => {
    maskCleanupTimer = null
    if (!props.show) {
      maskVisible.value = false
      boxVisible.value = false
      closingFromInside.value = false
      closingFromParent.value = false
    }
  }, MASK_LEAVE_MS)
}


interface NavigationItem {
  component: Component | string
  props?: Record<string, unknown>
}

const historyStack = ref<NavigationItem[]>([{
  component: props.initPage.component,
  props: {
    ...(props.initPage.props || {}),
    animation: props.animation,
    model: props.model
  },
}])

watch(() => props.initPage, (newVal) => {
    // 执行组件更新逻辑
    console.log('initPage变化:', newVal);
    if(newVal.component !== historyStack.value[0].component || 
    JSON.stringify(newVal.props) !== JSON.stringify(historyStack.value[0].props)){
      console.log('historyStack---重新赋值:', newVal);
      historyStack.value = [{
        component: newVal.component,
        props: {
          ...(newVal.props || {}),
          animation: props.animation,
          model: props.model
        },
      }]
    }
  },
  {
    deep: true, // 深度监听对象内部变化
    immediate: true // 立即执行一次
  }
);

watch(() => props.show, async (newVal: boolean) => {
  console.log("PageApp---watch---show---", maskVisible.value, boxVisible.value, props.show, newVal);
  if (newVal) {
    clearMaskCleanupTimer()
    closingFromInside.value = false
    closingFromParent.value = false
    maskVisible.value = true
    // 等一 tick，确保外层 DOM 已经放到页面上，再触发内层 enter（更可靠）
    await nextTick()
    boxVisible.value = true

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none' // 禁止移动端滑动
    // document.body.style.position = 'fixed'
    document.body.style.width = '100%'
  } else {
    // 父要求关闭：先触发内层 leave，遮罩由 onBoxAfterLeave / 定时器兜底卸载
    closingFromParent.value = true
    boxVisible.value = false
    scheduleMaskCleanup()

    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.body.style.position = ''
  }
},{
  deep: true, // 深度监听对象内部变化
  immediate: true // 立即执行一次
})
const handleSync = (data: any) => {
  emit('sync', data)
}

const currentPage = computed(() => 
  historyStack.value[historyStack.value.length - 1]
)

const handleNavigate = (component:Component, compProps: Record<string, unknown>) => {
  compProps.animation = props.animation;
  compProps.model = props.model;
  historyStack.value.push({ component, props: compProps })
}

const goBack = () => {
  if (historyStack.value.length > 0) {
    historyStack.value.pop()
    if(historyStack.value.length == 0){
      closeDialogAction()
    }
  }
}


const handleKeydown = (e: KeyboardEvent) => {
  if (props.show && e.key === 'Escape') {
    closeDialogAction()
  }
}

onMounted(()=>{
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  clearMaskCleanupTimer()
})

const clickMaskAction = () => {
  if(props.maskClosable){
    closeDialogAction()
  }
}

/**
 * 关闭入口（用户点击内部关闭按钮 / 遮罩等）
 * - 立即 emit update:show=false，让父级 show 同步，避免动画期间仍为 true 导致无法再次打开
 * - maskVisible 仍在 onBoxAfterLeave 中卸载，boxVisible 触发内层 leave 动画
 */
const closeDialogAction = () => {
  console.log("PageApp---closeDialogAction---");
  // 仅残留遮罩（after-leave 未跑完）时：点遮罩只做清理，避免 early return 导致永远关不掉
  if (!props.show && !boxVisible.value) {
    if (maskVisible.value) {
      clearMaskCleanupTimer()
      maskVisible.value = false
      closingFromInside.value = false
      closingFromParent.value = false
    }
    return
  }

  closingFromInside.value = true
  emit('update:show', false)
  boxVisible.value = false
  scheduleMaskCleanup()
  historyStack.value = [{
    component: props.initPage.component,
    props: {
      ...(props.initPage.props || {}),
      animation: props.animation,
      model: props.model
    },
  }]
  replaceHashName("#upgrade", "");
  autoBlurInput();
  setTimeout(() => {
    manualReset();
  }, 300);
}

const handleLoading = (val: boolean, text:string) => {
  showLoading.value = val;
  loadingText.value = text || '';
}


const onBoxAfterLeave = () => {
  console.log("PageApp---onBoxAfterLeave---");
  clearMaskCleanupTimer()
  maskVisible.value = false
  if (closingFromInside.value) {
    emit('update:show', false)
    emit('close')
    closingFromInside.value = false
    closingFromParent.value = false
  } else if (closingFromParent.value) {
    emit('close')
    closingFromParent.value = false
  } else {
    emit('close')
  }
}


</script>

<style lang="less" scoped>
.page-app-wrapper{
  overscroll-behavior: contain; // 阻止滚动链
  -webkit-overflow-scrolling: touch; // 移动端弹性滚动
  width: 100%;
  height: 100%;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99999999;
  background: transparent;
  transition: height 0.3s ease;
  height: calc(var(--vh, 1vh) * 100);
  overflow: hidden;
  box-shadow: 0 3px 6px -4px #0000001f, 0 6px 16px #00000014, 0 9px 28px 8px #0000000d;
   &[v-enter-to], &[v-leave-from] {
    transition: all 0.3s ease;
  }
  .page-app-box{
    position: absolute;
    padding-top: 50px;
    background-color: var(--stay-background);
    // box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
    // transform: none !important;
    z-index: 9999;
    &.mobile{
      -webkit-overflow-scrolling: touch;
      width: 100%;
      height: 100%;
      max-height: 100%;
      bottom: 0;
      left: 0;
      border-radius: 0px;
    }
    &.desktop{
      width: 390px;
      height: 760px;
      max-height: 85%;
      bottom: 50%;
      left: 50%;
      transform: translate(-50%, 50%);
      border-radius: 20px;
      padding-top: 50px;
    }
    .loading-box{
      width: 100%;
      height: 100%;
      position: fixed;
      top: 100%;
      transform: translateY(-100%);
      z-index: 999999;
      background-color: transparent;
      :deep(.stay-loading-box){
        width: 100%;
        height: 100px;
        background-color: rgba(0, 0, 0, 0.8);
        flex-direction: row;
        justify-content: start;
        align-items: self-start;
        padding: 20px;
        top: 100%;
        transform: translate(-50%, -100%);
        border-bottom-left-radius: 20px;
        border-bottom-right-radius: 20px;
        .loading-spinner{
          width: 26px;
          height: 26px;
        }
      }
    }
    
    .head-box{
      background-color: transparent;
      width: 100%;
      position: absolute;
      left: 0;
      top: 0px;
      height: 50px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 15px;
      .head-title{
        display: flex;
        justify-content: left;
        align-items: center;
        width: 100%;
        height: 100%;
        text-align: left;
        flex: 1;
        font-size: var(--stay-text-headline);
        font-weight: 700;
        color: var(--stay-black);
        user-select: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        .back{
          width: 28px;
          height: 100%;
          display: flex;
          justify-content: left;
          align-items: center;
          svg{
            width: 20px;
            height: 20px;
            fill: var(--stay-black);
            *{
              fill: var(--stay-black);
            }
          }
        }
      }
      .close{
        width: 24px;
        height: 24px;
        padding: 3px;
        border-radius: 12px;
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        background-color: var(--stay-border);
        display: flex;
        justify-content: center;
        align-items: center;
        svg {
          transform: scale(0.75); /* 缩小为原来的75% */
          transform-origin: center;  
          * {
            fill: var(--stay-black);
          }
        }
      }
    }
  }
}


.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.push-to-right-enter-active,
.push-to-right-leave-active,
.push-to-left-enter-active,
.push-to-left-leave-active,
.push-to-top-enter-active,
.push-to-top-leave-active,
.push-to-bottom-enter-active,
.push-to-bottom-leave-active {
  transition: all 0.3s ease;
}

.push-to-right-enter-from,
.push-to-right-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}
.push-to-left-enter-from,
.push-to-left-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.push-to-top-enter-from,
.push-to-top-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.push-to-bottom-enter-from,
.push-to-bottom-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}


/* --- 关键：desktop 情况下需要把“定位 transform”与“动画 transform”组合起来 --- */
/* 例如在 desktop 下 push-to-top，如果基础定位是 translate(-50%,50%)，动画开始时应该是 translate(-50%,50%) translateY(100%) */
.page-app-box.desktop.push-to-right-enter-from,
.page-app-box.desktop.push-to-right-leave-to {
  transform: translate(-50%, 50%) translateX(-100%) !important;
}
.page-app-box.desktop.push-to-left-enter-from,
.page-app-box.desktop.push-to-left-leave-to {
  transform: translate(-50%, 50%) translateX(100%) !important;
}
.page-app-box.desktop.push-to-top-enter-from,
.page-app-box.desktop.push-to-top-leave-to {
  transform: translate(-50%, 50%) translateY(100%) !important;
}
.page-app-box.desktop.push-to-bottom-enter-from,
.page-app-box.desktop.push-to-bottom-leave-to {
  transform: translate(-50%, 50%) translateY(-100%) !important;
}

</style>