<template>
  <teleport to="#app">
    <transition name="fade" >
      <div v-if="maskVisible" class="dialog-wrapper" @click.self="clickMaskAction" :style="{background: mask?'rgba(0, 0, 0, 0.1)':'transparent'}" >
        <transition :name="animation" @after-leave="onBoxAfterLeave">
          <div v-if="boxVisible" v-bind="$attrs" class="dialog-box" :class="[$attrs.class, isMobile() || model=='mobile' ? 'mobile' : 'desktop']" :style="$attrs.style ? {width: width, ...$attrs.style} : { width: width }">
            <div class="head-box" v-if="showHeader">
              <div class="head-title" v-if="title">{{ title }}</div>
            </div>
            <div class="close" v-if="showClose" @click="closeDialogAction" >
              <Image :src="CloseSvg" />
            </div>
            <div class="content">
              <slot></slot>
            </div>
            <slot name="footer" v-if="mergedFooter!=null" :footer="mergedFooter">
              <div class="btn-box" v-if="mergedFooter!=null" :class="[mergedFooter.btnDirection, mergedFooter.btnPlacement]">
                <div class="cancel-btn btn" v-if="mergedFooter.cancelText" :class="[mergedFooter.cancelClass]" :style="{ ...mergedFooter?.cancelStyle}" @click.stop="cancelClick">{{ mergedFooter.cancelText }}</div>
                <div class="ok-btn btn" :class="[mergedFooter.okClass]" @click.stop="okClick" :style="{...mergedFooter?.okStyle }">{{ mergedFooter.okText }}</div>
              </div>
            </slot>
          </div>
        </transition>
          
      </div>
    </transition>
  </teleport>
  
</template>
<script setup lang="ts">
import { computed, onMounted, watch, onUnmounted, ref, nextTick } from 'vue'
import type { FooterType }  from './FooterType.ts'
import CloseSvg from "@/assets/images/close-outlined.svg";
import Image from "@/components/layout/box/Image.vue"
import { isMobile } from '@/utils/device';
import { useViewportManager } from '@/components/ViewportManager';


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

const defaultFooter:FooterType = {
  okText: '确定',
  cancelText: '',
  btnDirection: 'vertical',
  okClass: '',
  cancelClass: '',
  okStyle: {},
  cancelStyle: {}
};

const props = defineProps({
  model:{
    type: String,
    default: "desktop"
  },
  showHeader:{  // 是否显示头
    type: Boolean,
    default: true
  },
  show: {
    type: Boolean,
    default: false
  },
  mask: {
    type: Boolean,
    default: true
  },
  width: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  footer: {
    type: [Object as ()=>FooterType, null],
    default: ()=>{return {}}
  },
  showClose: {
    type: Boolean,
    default: true
  },
  okWithClose: {
    type: Boolean,
    default: true
  },
  animation: {
    type: String,
    default: 'push-to-bottom' // push-to-right: 水平向右推进，push-to-right: 水平向左推进，
    // push-to-top: 纵向向顶部推进，push-to-bottom: 纵向向底部推进
  },
  maskClosable: {
    type: Boolean,
    default: true
  }
})

const maskVisible = ref(false)
const boxVisible = ref(false)
const closingFromInside = ref(false);  // 标记：是组件内部触发关闭（点击 X / 点击遮罩）
const closingFromParent = ref(false);  // 标记：是父组件通过 props.show=false 触发关闭


const emit = defineEmits(['close', 'ok', 'cancel', "update:show"])

watch(() => props.show, async (newVal) => {
  if (newVal) {
    
    maskVisible.value = true
    // 等一 tick，确保外层 DOM 已经放到页面上，再触发内层 enter（更可靠）
    await nextTick()
    boxVisible.value = true
    closingFromParent.value = false // 父触发打开


    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none' // 禁止移动端滑动
    document.body.style.width = '100%'

  } else {
    // 父要求关闭：不要立刻卸载遮罩；先触发内层 leave
    closingFromParent.value = true;
    boxVisible.value = false;
    
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.body.style.position = ''
  }
})



const onBoxAfterLeave = () => {
  maskVisible.value = false;
  if (closingFromInside.value) {
    // 关闭由组件内部触发：现在告知父组件更新 v-model，并发出 close 事件
    emit('update:show', false);
    emit('close');
    closingFromInside.value = false;
  } else if (closingFromParent.value) {
    // 关闭由父触发：父已经把 show 设 false，这里仅发出 close 事件通知（可选）
    emit('close');
    closingFromParent.value = false;
  } else {
    // 其他情况（保险处理）
    emit('close');
  }
}

const mergedFooter = computed(() => {
  return props.footer!=null ? Object.assign({}, defaultFooter, props.footer) : null
})

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
  
  
})

const clickMaskAction = () => {
  if(props.maskClosable){
    closeDialogAction()
  }
}

/**
 * 关闭入口（用户点击内部关闭按钮 / 遮罩等）
 * - 不要在这里立刻把 maskVisible 设为 false，也不要立刻 emit update:show，
 *   只把 boxVisible 设为 false 触发内层 leave，然后在 onBoxAfterLeave 中真正卸载遮罩并 emit
 */
const closeDialogAction = () => {
  // 不要在此处直接 maskVisible.value = false 或立即 emit update:show
  closingFromInside.value = true
  boxVisible.value = false   // 先收起弹窗（触发弹窗 leave）
  autoBlurInput();
  setTimeout(() => {
    manualReset();
  }, 300);
  
}

// const removeViewport = () => {
//   // 主动移除焦点，帮助收起键盘
//   const activeElement = document.activeElement as HTMLElement;
//   if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
//     activeElement.blur();
//   }
//   // 无论如何都恢复原始视口高度
//   if(isIOS()) {
//     setTimeout(() => {
      
//       document.documentElement.style.setProperty('--vh', `${originalViewportHeight.value || window.innerHeight * 0.01}px`);
//       // setTimeout(()=>{
//       //   document.documentElement.style.removeProperty('--vh');
//       // }, 400)
//       document.documentElement.style.removeProperty('--keyboard-height');
//     }, 400);
//   }
// }

const cancelClick = () => {
  closeDialogAction();
  emit('cancel')
  
}

const okClick = () => {
  props.okWithClose && closeDialogAction()
  emit('ok')
}

</script>
<style lang="less" scoped>
.dialog-wrapper{
  overscroll-behavior: contain; // 阻止滚动链
  -webkit-overflow-scrolling: touch; // 移动端弹性滚动
  width: 100%;
  height: 100%;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99999999;
  /* 让容器高度随键盘变化自适应 */
  height: calc(var(--vh, 1vh) * 100);
  transition: height 0.3s ease;
  overflow: hidden;
  // transform: translateZ(0);
  box-shadow: 0 3px 6px -4px #0000001f, 0 6px 16px #00000014, 0 9px 28px 8px #0000000d;
  .dialog-box{
    max-height: 80%;
    overflow-y: auto;
    position: absolute;
    background-color: var(--stay-background);
    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease, opacity 0.3s ease;
    &.mobile{
      -webkit-overflow-scrolling: touch;
      width: 100%;
      bottom: 0;
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      border-bottom-right-radius: 0;
      border-bottom-left-radius: 0;
    }
    &.desktop{
      width: 390px;
      bottom: 50%;
      left: 50%;
      transform: translate(-50%, 50%);
      border-radius: 20px;
    }
    .close{
      width: 24px;
      height: 24px;
      padding: 3px;
      border-radius: 12px;
      position: absolute;
      right: 15px;
      top: 15px;
      z-index: 99999999;
      // transform: translateY(-50%);
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
    .head-box{
      width: 100%;
      position: sticky;
      left: 0;
      top: 0px;
      height: 45px;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      padding: 0 50px 0 20px;
      background-color: var(--stay-background);
      z-index: 999;
      .head-title{
        width: 100%;
        text-align: left;
        flex: 1;
        font-size: var(--stay-text-headline);
        font-weight: 700;
        color: var(--stay-black);
        user-select: none;
      }
      
    }
    .content{
      width: 100%;
      // height: 720px;
      max-height: 80%;
      padding: 20px 20px;
      position: relative;
    }
    .btn-box{
      width: 100%;
      padding: 15px 20px 20px 20px;
      display: flex;
      gap: 10px;
      justify-content: center;
      align-items: center;
      position: sticky;
      bottom: 0;
      left: 0;
      z-index: 999;
      background-color: var(--stay-background);
      &.vertical{
        flex-direction: column-reverse;
        gap: 15px;
        .btn{
          width: 100%;
          height: 35px;
          border-radius: 20px;
        }
      }
      &.horizontal{
        flex-direction: row;
        .ok-btn{
          width: 50%;
          border: 1px solid var(--s-main);
          color: var(--s-main);
          background: var(--stay-backgroundSecondary);
        }
        .cancel-btn{
          border: 1px solid var(--stay-placeholder);
          color: var(--stay-placeholder);
        }
      }
      &.left{
        justify-content: flex-start;
      }
      &.right{
        justify-content: flex-end;
      }
      .ok-btn{
        border: 1px solid var(--s-main);
        background: var(--s-main);
        color: var(--stay-white);
        margin: 0 auto;
        &:hover{
          box-shadow: 0px 0px 2px var(--s-main);
        }
      }
      .btn{
        width: 50%;
        height: 40px;
        border-radius: 10px;
        font-size: var(--stay-text-body);
        text-align: center;
        // line-height: 38px;
        font-weight: 700;
        cursor: pointer;
        user-select: none;
        display: flex;
        justify-content: center;
        align-items: center;
        
      }
      .cancel-btn{
        color: var(--stay-black);
        background: var(--stay-backgroundSecondary);
        &:hover{
          box-shadow: 0px 0px 2px rgba(0, 0, 0, 0.2);
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


/* push 动画：保留你原来的类名 -> 重要点：对 .desktop 做组合 transform，避免 transform 被覆盖 */
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

/* 非 desktop（或 mobile）情况直接使用平移 */
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
.dialog-box.desktop.push-to-right-enter-from,
.dialog-box.desktop.push-to-right-leave-to {
  transform: translate(-50%, 50%) translateX(-100%) !important;
}
.dialog-box.desktop.push-to-left-enter-from,
.dialog-box.desktop.push-to-left-leave-to {
  transform: translate(-50%, 50%) translateX(100%) !important;
}
.dialog-box.desktop.push-to-top-enter-from,
.dialog-box.desktop.push-to-top-leave-to {
  transform: translate(-50%, 50%) translateY(100%) !important;
}
.dialog-box.desktop.push-to-bottom-enter-from,
.dialog-box.desktop.push-to-bottom-leave-to {
  transform: translate(-50%, 50%) translateY(-100%) !important;
}


</style>

