<template>
  <div class="option-wrapper-box">
    <Header @collapsed="handleCollapsedSlider"></Header>
    <div class="content-wrapper">
      <Slider :isOpen="collapsed">
        <Menu @change="handleChangeMenu"/>
        <!-- <SpacesPannel /> -->
      </Slider>
      <Content>
        <slot></slot>
      </Content>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import Header from './header/Header.vue';
import Content from './desktop/Content.vue';
import Slider from "./desktop/Slider.vue";
import Menu from './desktop/Menu.vue';
// import SpacesPannel from '@/components/spaces/SpacesPannel.vue';


const collapsed = ref<boolean>(true);

const emit = defineEmits(['view']);
const props = defineProps({
  collapsible: {
    type: Boolean,
    default: true
  }
})
const drawerOpen = ref<boolean>(props.collapsible);

// const collapsible = ref<boolean>(props.collapsible);

watch(() => props.collapsible, (newValue) => {
  drawerOpen.value = newValue;
});


const handleCollapsedSlider = (isOpen: boolean) => {
  console.log('desktop handleCollapsedSlider collapsed', isOpen)
  // 原代码试图给一个布尔值设置value属性，会报错，修改为更新ref对象的值
  collapsed.value = isOpen;
} 

const handleChangeMenu = (viewPath: string) => {
  emit('view', viewPath);
}


</script>
<style scoped lang="less">
.option-wrapper-box{
  width: 100%;
  min-height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  // max-width: 1960px;
  min-width: 780px;
  width: 100%;
  height: 100vh;
  // margin: 0 auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: start;
  .content-wrapper{
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: start;
    align-items: start;
    gap: 10px;
    flex: 1;
    overflow-y: auto;
  }
}
</style>