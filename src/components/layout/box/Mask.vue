<template>
  <div class="mask-wrapper" v-if="isShow">
    <div class="mask-content">
      <div class="mask-text">
        <span v-if="text">{{ text }}</span>
        <Button type="link" @click="clickAction" v-if="button">{{ button }}</Button>
      </div>
      
      <slot></slot>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/layout/box/Button.vue'
const emit = defineEmits(["click", "update:visible"])
const props = defineProps({
  button: {
    type: String,
    default: ""
  },
  visible: {
    type: Boolean,
    default: false
  },
  text: {
    type: String,
    default: ""
  }
})
watch(() => props.visible, (newVal) => {
  isShow.value = newVal
})
const isShow = ref(props.visible)
// const close = () => {
//   emit("close")
//   emit("update:visible", false)
// }
const clickAction = () => {
  emit("click")
  // emit("update:visible", false)
}
</script>
<style scoped lang="less">
/* Your style code here */
.mask-wrapper{
  position: fixed;
  top: 44px;
  left: 0;
  width: 100%;
  height: calc(100% - 44px);
  background-color: var(--stay-background);
  z-index: 99999;
  .mask-content{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    // background-color: var(--stay-backgroundSecondly);
    // backdrop-filter: blur(10px);
    padding: 20px;
    border-radius: 4px;
    // box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    .mask-text{
      position: relative;
      width: 100%;
      padding: 10px;
      margin-bottom: 22px;
      font-size: var(--stay-text-body);
      font-weight: 500;
      color: var(--stay-black);
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }
}
</style>