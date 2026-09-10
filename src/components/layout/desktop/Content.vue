<template>
  <transition name="content-box">
    <div class="content-box" >
      <slot></slot>
    </div>
  </transition>
</template>
<script setup lang="ts">
// import { ref, defineProps, watch } from 'vue';


</script>
<style scoped lang="less">
.content-box{
  display: flex;
  flex: 1;
  transition: all 0.4s ease; /* 修改过渡属性 */
  width: auto; /* 移除固定宽度 */
  height: 100%;
  padding: 0px 20px 20px 20px;
  overflow-y: hidden;
}
/* 定义 content-box 过渡动画 */
.content-box-enter-active,
.content-box-leave-active {
  transition: all 0.5s ease;
}
.content-box-enter-from {
  transform: translateX(0); /* 初始状态，位置不变 */
}
.content-box-enter-to {
  transform: translateX(350px); /* 结束状态，向右移动350px */
}
.content-box-leave-from {
  transform: translateX(350px); /* 离开初始状态，在右侧350px位置 */
}
.content-box-leave-to {
  transform: translateX(0); /* 离开结束状态，回到初始位置 */
}

</style>