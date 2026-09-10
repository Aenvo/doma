<template>
  <div>
    <transition :name="aniType">
      <div class="m-notice" :class="direction" v-show="showNotice">
        <div class="m-msg">{{ title }}</div>
        <div class="close-icon" v-if="durationValue==0" @click.stop="hideToastAction"></div>
      </div>
    </transition>
    <div v-if="showNotice && mask" class="stay-toast-overlay"></div>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeMount, onMounted, watch, ref } from "vue";

const emit = defineEmits(["callback"]);
const props = defineProps({
  title: {
    type: String,
    default: "Loading...",
  },
  duration: {
    type: Number,
    default: 3500,
  },
  mask: {
    type: Boolean,
    default: false,
  }
});

const showNotice = ref(false);
const aniType = ref("toast-animation-H");
const direction = ref("m-H-right");
const titleValue = ref(props.title);
const durationValue = ref(props.duration);
// console.log('props.title-----', props.title);
watch([() => props.title, ()=> props.duration], ([newTitle, newDuration]) => {
    titleValue.value = newTitle;
    durationValue.value = newDuration;
    if(durationValue.value>0){
      let timer = setTimeout(() => {
        showNotice.value = false;
        emit('callback')
        clearTimeout(timer);
      }, durationValue.value);
    }
});
const isMobileDevice = () => {
  const userAgentInfo = navigator.userAgent;
  let Agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPod"];
  let getArr = Agents.filter((i) => userAgentInfo.includes(i));
  return getArr.length ? true : false;
}
onBeforeMount(() => {
  if (isMobileDevice() || window.innerWidth <= 618) {
    aniType.value = "toast-animation-V";
    direction.value = "m-V-top";
  }
});

// const hideTime = toRef(props, "duration").value;
console.log('duration-----', durationValue.value)
onMounted(() => {
  showNotice.value = true;
  if(durationValue.value>0){
    let timer = setTimeout(() => {
      showNotice.value = false;
      emit('callback')
      clearTimeout(timer);
    }, durationValue.value);
  }
});

const hideToastAction = () => {
  showNotice.value = false;
  emit('callback')
}
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

.toast-animation-H-enter-active,
.toast-animation-H-leave-active {
  animation: showH 0.3s ease-out;
}

.toast-animation-H-enter,
.toast-animation-H-leave-to {
  animation: hideH 0.3s ease-in;
}

@keyframes dropIn {
  0% {
    transform: translate(-50%, -150%);
  }
  100% {
    transform: translate(-50%, 0px);
  }
}
@keyframes dropOut {
  0% {
    transform: translate(-50%, 0px);
  }
  100% {
    transform: translate(-50%, -200%);
  }
}

.toast-animation-V-enter-active {
  animation: dropIn 0.3s forwards;
}
.toast-animation-V-leave-active {
  animation: dropIn 0.3s forwards;
  // animation: dropIn 0.3s forwards;
}

// 初始状态
.toast-animation-V-enter {
  // transform: translate(-50%, 0px);
  animation: dropOut 0.3s forwards;
}

// 最终状态
.toast-animation-V-leave-to {
  // transform: translate(-50%, 80px);
  animation: dropOut 0.3s forwards;
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
    font-size: var(--stay-text-subheadline);
    color: var(--stay-black);
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-height: 17px;
    // margin-top: 8px;
  }
  .close-icon{
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    background: url("@/assets/images/close-outlined.svg") no-repeat 50% 50%;
    background-size: 10px;
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
.m-H-right {
  max-width: 350px;
  min-width: 200px;
  right: 15px;
  top: 15px;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 20px;
}
.m-V-top {
  max-width: 270px;
  min-width: 220px;
  left: 50%;
  top: 80px;
  transform: translate(-50%, 0);
  justify-content: center;
  align-items: center;
  padding: 10px 15px;
}
</style>
