<template>
    <div>
      <transition name="animation-v">
        <div class="m-notice m-V-top" v-show="show">
          <div class="m-msg">{{ title }}</div>
        </div>
      </transition>
      <div v-if="show && mask" class="stay-toast-overlay"></div>
    </div>
  </template>
  
  <script lang="ts" setup>
  import { onMounted, watch, ref } from "vue";
  
  const emit = defineEmits(['callback', 'update:show']);
  const props = defineProps({
    title: {
      type: String,
      default: "Loading..."
    },
    show: {
      type: Boolean,
      default: false
    },
    mask: {
      type: Boolean,
      default: true
    }
  });
  
  
  const titleValue = ref(props.title);
  console.log('props.title-----', props.title);
  watch([() => props.title], ([newTitle]) => {
      titleValue.value = newTitle;
  });
  

  // const hideTime = toRef(props, "duration").value;
  onMounted(() => {
    
    
  });

  </script>
  
<style lang="less" scoped>
@keyframes showH {
  0% {
    transform: translateX(370px);
  }
  100% {
    transform: translateX(0px);
  }
}

@keyframes hideH {
  0% {
    transform: translateX(0px);
  }
  100% {
    transform: translateX(370px);
  }
}
  
@keyframes dropIn {
  0% {
    transform: translate(-50%, 50%);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
}
@keyframes dropOut {
  0% {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, 50%);
    opacity: 0;
  }
}
  
.animation-v-enter-active {
  animation: dropIn 0.3s forwards;
}
.animation-v-leave-active {
  animation: dropOut 0.6s forwards;
}

.animation-v-enter {
  animation: dropIn 0.3s forwards;;
}

.animation-v-leave-to {
  animation: dropOut 0.6s forwards;
}

.m-notice {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  flex: 1 0 auto;
  border-radius: 10px;
  background-color: var(--stay-background);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.08);
  .m-msg {
    font-size: var(--stay-text-headline);
    color: var(--stay-black);
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-height: 17px;
  }
  
}
.stay-toast-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.1);
  z-index: 2147483640; /* 遮罩层要显示在其他内容之上 */
}

.m-V-top {
  width: 300px;
  height: 100px;
  left: 50%;
  top: 30%;
  transform: translate(-50%, -50%);
  justify-content: center;
  align-items: center;
  padding: 10px 15px;
}
</style>
  