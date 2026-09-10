<template>
  <div class="stay-select" @click.stop="toggleDropdown" ref="selectRef">
    <div class="selected-option">
      <span>{{ selectedOption?.label || placeholder }}</span>
      <Image 
        :src="icon || SelectSvg" 
        class="select-icon"
        :class="{ 'rotate-180': isOpen }"
      />
    </div>
    <transition name="fade">
      <ul v-show="isOpen" class="options-list" :style="optionsStyle">
        <li
          v-for="option in options"
          :key="option.value"
          @click.stop="selectOption(option)"
          :class="[{ 'selected': option.value === value }, { 'disabled': option.disabled },]"
        >
          <slot name="option" :option="option">
            {{ option.label }}
          </slot>
        </li>
      </ul>
    </transition>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted } from 'vue'
// import SelectSvg from "./svg/select.svg"
import SelectSvg from "./svg/arrowdown.svg"
import { type OptionModel } from "./OptionsType"
import Image from '@/components/layout/box/Image.vue'
const emit = defineEmits(['change', 'open'])
defineOptions({
  inheritAttrs: true,
})
const props = defineProps({
  value: {
    type: [String, Number],
    default: ""
  },
  options: {
    type: Array as () => OptionModel[],
    required: true
  },
  placeholder: {
    type: String,
    default: '请选择'
  },
  icon: {
    type: [Object, String], // Vue 组件
    default: null
  },
  optionsStyle: {
    type: Object,
    default: () => ({})
  }
})

// watch(() => [props.modelValue, props.options] as [string|number, OptionModel[]], ([newValue, newOptions]) => {
//   // console.log('modelValue 变化了:', newValue, newOptions)
// })

const selectRef = ref<HTMLElement | null>(null)

// 点击外部关闭下拉框
const handleClickOutside = (event: MouseEvent) => {
  // isOpen.value = false
  if ((selectRef.value && !selectRef.value.contains(event.target as Node))) {
    isOpen.value = false
  }
}


const handleKeydown = (e: KeyboardEvent) => {
  if (isOpen.value && e.key === 'Escape') {
    isOpen.value = false
  }
}


onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})


const isOpen = ref(false)
const selectedOption = computed(() => 
  props.options.find(opt => opt.value === props.value || opt.label === props.value)
)
const toggleDropdown = () => {
  isOpen.value = !isOpen.value
  if(isOpen.value){
    emit('open')
  }
}
const selectOption = (option: OptionModel) => {
  // isOpen.value = false
  console.log('selectOption---', option, option.value)
  emit('change', option.value, option)
  toggleDropdown()
}
</script>
<style scoped lang="less">
.stay-select{
  position: relative;
  width: 120px;
  height: 36px;
  cursor: pointer;
  padding-right: 4px;
  border-radius: 5px;
  border: 1px solid var(--stay-border);
  background: var(--stay-background);
  padding: 0 10px;
  flex-shrink: 0;
  .selected-option {
    display: flex;
    width: 100%;
    height: 100%;
    justify-content: space-between;
    align-items: center;
    font-size: var(--stay-text-body);
    
    span{
      padding-right: 10px;
      width: 100%;
      text-align: left;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
  }
  .select-icon {
    transition: transform 0.2s ease;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    transform-origin: center; // 明确设置旋转中心
    &.rotate-180 {
      transform: rotate(180deg);
    }
    & * {
      fill: var(--stay-placeholder);
    }
  }
  .options-list {
    position: absolute;
    top: 100%;
    width: 100%;
    left: 0;
    right: 0;
    background: inherit;
    border: 1px solid var(--stay-border);
    border-radius: 5px;
    max-height: 200px;
    overflow-y: scroll;
    z-index: 880;
    padding: 10px 0;
    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
    li {
      padding: 6px 12px;
      width: 100%;
      text-align: left;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      position: relative;
      &:hover {
        background: rgba(0, 0, 0, 0.05);
        // border-radius: 5px;
      }
      &::before {
        content: '';
        position: absolute;
        left: 12px; /* 从30px开始划线 */
        right: 12px;
        bottom: 0;
        height: 1px;
        background: var(--stay-border);
      }
      &.selected {
        background: rgba(0, 0, 0, 0.05);
        // border-radius: 5px;
      }
      &:last-child::before {
        display: none;
      }
      &.disabled {
        color: var(--stay-placeholder);
        cursor: not-allowed;
        opacity: 0.7;
      }
    }
  }
  fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.2s, transform 0.2s;
  }
  
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>