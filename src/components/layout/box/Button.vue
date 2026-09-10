<template>
  <div class="st-btn" :class="type">
    <div class="st-icon" v-if="icon">
      <img v-if="typeof icon === 'string'" :src="icon" >
      <component v-else :is="icon" />
    </div>
    <span><slot></slot></span>
  </div>
</template>
<script setup lang="ts">
// import { defineProps } from 'vue'
defineOptions({
  inheritAttrs: true
})
defineProps({
  type: {
    type: String,
    default: ""
  },
  text: {
    type: String,
    default: ""
  },
  icon: {
    type: [String, Object],
    default: ''
  }
})



</script>
<style scoped lang="less">
.st-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  flex-shrink: 0;
  // max-width: 320px;
  padding: 0 10px;
  border-radius: 10px;
  gap: 5px;
  background-color: var(--stay-backgroundSecondary);
  cursor: pointer;
  user-select: none;
  font-size: var(--stay-text-body);
  font-weight: 600;
  color: var(--stay-secondaryFont);
  &.link{
    color: var(--stay-black);
    background-color: transparent;
    text-decoration: underline;
    padding: 0 2px;
    &:hover{
      color: var(--stay-secondaryFont);
    }
  }
  .st-icon{
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    img{
      max-width: 20px;
      max-height: 20px;
      object-fit: contain;
    }
    svg{
      // max-width: 20px;
      // height: auto;
      // width: 20px;
      // height: 20px;
      width: 20px;
      // flex-shrink: 0;
      * {
        fill: var(--stay-black)
      }
    }
  }
  
}
</style>