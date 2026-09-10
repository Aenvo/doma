<template>
  <input :type="type" ref="myInput" :disabled="!!disabled" class="input-con" v-model="inputValue" @mousedown="handleMouseDown"  
    @dblclick="handleDoubleClick" @keyup="handleKeyUp" @input="handleInputValue" @focus="$emit('focus', $event)" @blur="$emit('blur', $event)" 
    @paste="$emit('paste', $event)" :maxlength="maxlength" 
    :placeholder="placeholder" 
    @change="changeInputValue"
    autocomplete="off"
    :autofocus="autofocus"
  />
</template>
<script setup lang="ts">
import { reactive, ref, toRefs, watch, onMounted, onUnmounted, nextTick } from 'vue'

const emit = defineEmits(['change', 'input', 'enter', 'paste', 'keyup', 'focus', 'dbclick', 'update:value', 'blur'])
const props = defineProps({
  placeholder: {
      type: String,
      default: 'Input value'
  },
  uid: {      // 唯一标识,对于一些需要修改的input,需要传入uid,用于区分不同的input，特别是用于双击编辑的时候
    type: String,
    default: ""
  },
  value: {
    type: String,
    default: ""
  },
  disabled: {
    type: Boolean,
    default: false
  },
  focus: {
    type: String,
    default: 'click'
  },
  maxlength: {
    type: Number,
    default: null
  },
  autofocus: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'text' // 可以是 'text'、'password' 等input中type类型
  }
});
const state = reactive({
  isFocus: false,
  inputValue: props.value,
})
const { inputValue } = toRefs(state)
// 修改 ref 的类型，允许 null 值
const myInput = ref<HTMLInputElement | null>(null);

watch(props, (newProps) => {
  if(newProps.autofocus){
    console.log('watch---props.autofocus------', props.autofocus, myInput?.value)
    nextTick(()=>{
      console.log("watch--nextTick------", document.activeElement)
      setTimeout(() => {
        myInput.value?.dispatchEvent(new MouseEvent('click'))
        myInput.value?.focus();
        console.log("watch---当前焦点元素:", document.activeElement);
      }, 300);
    })
  }
  state.inputValue = newProps.value
},{ immediate: true, deep: true })

onMounted(()=>{
  console.log('props.maxlength------', props.maxlength)
  if(props.autofocus){
    console.log('props.autofocus------', props.autofocus)
    nextTick(()=>{
      // myInput.value?.click();
      // myInput?.value?.focus()
      setTimeout(() => {
        myInput.value?.dispatchEvent(new MouseEvent('click'))
        myInput.value?.focus()
        // console.log("当前焦点元素:", document.activeElement);
      }, 300);
    })
  }
  
  
})



const handleInputValue = () => {
  // console.log('handleInputValue----', state.inputValue)
  emit("update:value", state.inputValue)
  emit("input", state.inputValue, props.uid)
}
const changeInputValue = () => {
  // console.log('changeInputValue----', state.inputValue)
  emit("change", state.inputValue, props.uid)
}
const handleKeyUp = (e: KeyboardEvent) => {
  // console.log("handleKeyUp----", e)
  if (e.key === 'Enter') {
    emit('enter', e);  // 单独触发 enter 事件
  }
  emit("keyup", state.inputValue, props.uid)
}

const handleMouseDown = (event: Event) => {
  if(props.focus == 'dbclick'){
      if(state.isFocus){
          return;
      }
      // 阻止默认的焦点行为
      event.preventDefault();
      myInput?.value?.blur();
  }
}

// 双击事件处理程序
const handleDoubleClick = () => {
  if(props.focus == 'dbclick'){
      // 获取 input 元素并获取焦点
      myInput?.value?.focus();
      state.isFocus = true;
      emit("dbclick", ()=>{
          myInput?.value?.blur();
          state.isFocus = false;
      })
      // 取消对单击事件的监听，以阻止单击时获取焦点
      // myInput.value.removeEventListener('click', handleClick);
  }
};
</script>
<style scoped>
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
.input-con{
  width: 100%;
  height: 45px;
  padding: 0 10px;
  font-size: var(--stay-text-body);
  color: var(--stay-black);
  background: var(--stay-backgroundSecondary);
  border-radius: 10px;
}
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
textarea:-webkit-autofill:hover,
textarea:-webkit-autofill:focus {
  background-color: var(--stay-backgroundSecondary)!important;
  -webkit-text-fill-color: var(--stay-black) !important; /* Tailwind text-gray-900 */
  transition: background-color 9999s ease-out;
  box-shadow: 0 0 0px 1000px var(--stay-backgroundSecondary) inset !important; /* Tailwind bg-white */
}

</style>