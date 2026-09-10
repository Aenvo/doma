<template>
  <transition name="fade">
    <div class="push-drawer-wrapper"  :style="{background: mask?'var(--stay-backgroundMask)':'transparent'}" @click.stop="clickClose" v-show="show">
      <transition :name="`animation-${placement}`">
        <div v-if="show" class="push-drawer" :class="placement" :style="drawerStyle"  @click.stop>
          <div class="header">
            <div class="title">{{ title }}</div>
            <div class="close" @click="clickClose">
              <Image :src="CloseOutlineSvg"></Image>
            </div>
          </div>
          <slot></slot>
        </div>
      </transition>
    </div>
  </transition>
</template>
<script setup lang="ts">
import { computed } from 'vue';
// import { useI18n } from 'vue-i18n';
import CloseOutlineSvg from '@/assets/images/close-outlined.svg';
import Image from '../Image.vue';

// const { t } = useI18n();
const emit = defineEmits(["close","update:show"])
const props = defineProps({
  title: {
    type: String,
    default: ""
  },
  placement: {
    type: String,
    default: "bottom"
  },
  mask: {
    type: Boolean,
    default: true
  },
  height: {
    type: String,
    default: "60%" // 默认高度为60% 只针对placement为bottom、top时有效
  },
  width: {
    type: String,
    default: "40%" // 默认高度为60% 只针对placement为left、right时有效
  },
  show: {
    type: Boolean,
    default: false
  },
})


// const { } = toRefs(state)

// watch(props, (newProps) => {
  
  
// },{ immediate: true, deep: true })

// 计算抽屉样式
const drawerStyle = computed(() => {
  const styles: Record<string, string> = {}
  if (props.placement === 'bottom' || props.placement === 'top') {
    styles.maxHeight = props.height
    styles.minHeight = props.height
  } else {
    styles.maxWidth = props.width // 对于左右方向，使用height参数控制宽度
    styles.minWidth = props.width
  }
  return styles
})

const clickClose = () => {
  // props.show = false
  emit("update:show", false);
  emit("close")
}

</script>
<style lang="less" scoped>
.push-drawer-wrapper{
  width: 100%;
  height: 100%;
  position: fixed;
  z-index: 2147483647;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding-top: 44px;
  background: var(--stay-backgroundMask);
  .push-drawer{
    background-color: var(--stay-background);
    // height: auto;
    overflow: hidden;
    padding: 0 18px 18px;
    transform: translate(0%, 0%);
    display: flex;
    flex-direction: column;
    position: absolute;
    z-index: 99999999;
    &.bottom {
      width: 100%;
      bottom: 0;
      left: 0;
      right: 0;
      border-radius: 10px 10px 0 0;
      max-height: 60%;
      min-height: 60%;
      height: auto;
    }
    &.top {
      width: 100%;
      top: 0;
      left: 0;
      right: 0;
      border-radius: 0 0 10px 10px;
      max-height: 60%;
      min-height: 60%;
      height: auto;
    }
    &.left {
      height: 100%;
      top: 0;
      left: 0;
      bottom: 0;
      border-radius: 0 10px 10px 0;
      width: 40%;
    }
    &.right {
      height: 100%;
      width: 40%;
      top: 0;
      right: 0;
      bottom: 0;
      border-radius: 10px 0 0 10px;
    }
    .header{
      background-color: var(--stay-background);
      height: 54px;
      width: 100%;
      // padding: 0 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      left: 0;
      z-index: 999;
      .title{
        font-size: var(--stay-text-headline);
        font-weight: 700;
        color: var(--stay-black);
        user-select: none;
        min-width: 100px;
      }
      .close{
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background-color: var(--stay-border);
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        overflow: hidden;
        cursor: default;
        user-select: none;
        img{
          width: 14px;
          height: 14px;
          filter: drop-shadow(var(--stay-secondaryFont) -22px 0);
          border-left: 44px solid transparent;
        }
      }
    }
    
  }
}


.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}


// 定义不同方向的动画
@keyframes slideInBottom {
  0% { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
@keyframes slideOutBottom {
  0% { transform: translateY(0); }
  100% { transform: translateY(100%); }
}

@keyframes slideInTop {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(0); }
}
@keyframes slideOutTop {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}

@keyframes slideInLeft {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(0); }
}
@keyframes slideOutLeft {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}

@keyframes slideInRight {
  0% { transform: translateX(100%); }
  100% { transform: translateX(0); }
}
@keyframes slideOutRight {
  0% { transform: translateX(0); }
  100% { transform: translateX(100%); }
}

// 动态应用动画
.animation-bottom-enter-active {
  animation: slideInBottom 0.3s forwards;
}
.animation-bottom-leave-active {
  animation: slideOutBottom 0.3s forwards;
}

.animation-top-enter-active {
  animation: slideInTop 0.3s forwards;
}
.animation-top-leave-active {
  animation: slideOutTop 0.3s forwards;
}

.animation-left-enter-active {
  animation: slideInLeft 0.3s forwards;
}
.animation-left-leave-active {
  animation: slideOutLeft 0.3s forwards;
}

.animation-right-enter-active {
  animation: slideInRight 0.3s forwards;
}
.animation-right-leave-active {
  animation: slideOutRight 0.3s forwards;
}
</style>