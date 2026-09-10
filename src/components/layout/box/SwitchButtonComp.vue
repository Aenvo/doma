<template>
    <div class="switch-button-box" @click.stop="handleCustomEvent">
      <div v-for="(item,index) in buttonList" class="switch-item" :style="{width: item.width? item.width:'33.33%'}" :class="switchState==item.value?'active':''" :key="index" @click.stop="switchButtonAction(item.value)">
        {{ item.name }}
      </div>
    </div>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
const emit = defineEmits(['switchAction']);
const props = defineProps({
    buttonList: {
      type: Array,
      default: () => []
    },
    switchStatus: {
      type: String,
      default: ''
    }
})
const buttonList = ref(props.buttonList);
const switchState = ref(props.switchStatus);
watch(
    props,
    (newProps) => {
        // 接收到的props的值
        buttonList.value = newProps.buttonList;
        console.log('newProps.switchStatus---------', newProps.switchStatus)
        switchState.value = newProps.switchStatus;
    },
    { immediate: true, deep: true }
);
const switchButtonAction = (value) => {
    emit('switchAction', value);
}
const handleCustomEvent = (event) => {
    event.stopPropagation(); // 阻止事件冒泡
}
</script>
<style lang="less" scoped>
    .switch-button-box {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 36px;
        background-color: var(--stay-secondaryBackground);
        box-shadow: 0 0 1px 0 rgba(0, 0, 0, 10%);
        border: 1px solid var(--stay-border);
        padding: 4px 6px;
        border-radius: 8px;
        .switch-item{
            width: 33.33%;
            height: 100%;
            display: flex;justify-content: center;align-items: center;
            font-size: var(--stay-text-subheadline);
            font-weight: 700;
            color: var(--stay-secondaryFont);
            user-select: none;
            cursor: pointer;
            &.active{
                background-color: var(--s-main);
                color: var(--stay-white);
                border-radius: 6px;
            }
        }
    }
</style>
