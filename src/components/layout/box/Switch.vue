<template>
  <label class="switch" :class="{'readonly': readonly, 'disabled': disabled}" @click.stop="handleCustomEvent">
    <input type="checkbox" v-model="effectiveOn" @change='switchAction($event)' :aria-readonly="readonly" :readonly="readonly" :disabled="disabled">
    <span class="slider"></span>
  </label>
</template>
<script setup lang="ts">
import { watch, computed, ref } from 'vue'
const emit = defineEmits(['change', "update:on"]);
const props = defineProps({
  on: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  readonly: {
    type: Boolean,
    default: false
  }
})

watch(
() => {
  // 接收到的props的值
},
(_newValue, _oldValue) => {
  // 当props的值发生变化时执行的逻辑
  // console.log('props的值发生变化:', newValue, oldValue);
},
{ immediate: true, deep: true });

const localOn = ref(props.on);

const effectiveOn = computed(() => props.on)

const switchAction = (event: Event) => {
  // console.log('switchAction', event);
  if(props.readonly){
    // console.log('switchAction----readonly', event);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return;
  }
  const target = event?.target as HTMLInputElement;
  const checked = target?.checked;
  localOn.value = checked;
  emit('change', checked);
  emit("update:on", checked);
}
const handleCustomEvent = (event: MouseEvent) => {
  event.stopPropagation(); // 阻止事件冒泡
}

</script>
<style lang="less" scoped>
input::-webkit-input-placeholder{font-family: "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--stay-placeholder); font-size: 16px;}
input:-moz-placeholder{font-family: "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--stay-placeholder); font-size: 16px;}
input::-moz-placeholder{font-family: "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--stay-placeholder); font-size: 16px;}
input{ vertical-align:middle;}
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0;}
input, select {
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  box-shadow: none !important;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}
.switch {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 24px;
  min-height: 24px;
  &.disabled{
    .slider{
      background-color: var(--stay-backgroundTertiary);
    }
    .slider:before {
      background-color: var(--stay-white);
    }
    input:checked + .slider{
      // background-color: var(--s-main);
      opacity: 0.7;
    }
  }
  &.readonly{
    cursor: not-allowed;
    opacity: 0.9;
    pointer-events: none;
  }
}

.switch input {
  display: none;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--stay-backgroundMask);
  transition: .3s;
  border-radius: 21px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 2px;
  background-color: var(--stay-white);
  transition: .3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--s-main);
}

input:checked + .slider:before {
  transform: translateX(16px);
}
input[disabled] + .slider {
  /* 添加禁用状态的样式 */
  opacity: 0.8;
  cursor: not-allowed;
  /* 其他样式 */
}

input[readonly] + .slider {
  cursor: not-allowed;
  opacity: 0.9;
  pointer-events: none;
}

</style>
