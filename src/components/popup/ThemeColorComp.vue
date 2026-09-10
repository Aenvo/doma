<template>
  <Dialog :show="show" class="theme-color-popup" animation="push-to-top" model="mobile" :footer="null"  @close="closePopupAction">
    <div class="themes-box" >
      <template>
        <div id="colorPicker" class="color-picker" ref="pickerRef" >colorPicker</div>
        <div class="theme-name">
          <div class="label">{{ $t('theme_name') }}</div>
          <div class="name-input">
            <!-- <input type="text" :placeholder="$t('theme_name')" v-model="themeName" > -->
            <Input :placeholder="$t('new_theme')" v-model:value="themeName" class="theme-name-input" />
          </div>
          <div class="error-msg" v-if="errorMsg">{{ errorMsg }}</div>
        </div>
        <div class="theme-colors">
          <div class="label">{{ $t('theme_color') }}</div>
          <div class="colors-input">
            <div class="bg-color color-item">
              <div class="color-name">{{ $t('bg_color') }}</div>
              <div class="color-area" :style="{background: bgColor}" @click="pickerColorAction('background')"></div>
            </div>
            <div class="text-color color-item">
              <div class="color-name">{{ $t('text_color') }}</div>
              <div class="color-area" :style="{background: textColor}" @click="pickerColorAction('text')"></div>
            </div>
          </div>
        </div>
        <div class="btn-box">
          <div class="save-btn btn" @click="saveDarkmodeThemeAction('apply')">{{ $t('save_apply') }}</div>
          <div class="save-btn btn" @click="saveDarkmodeThemeAction('quit')">{{ $t('save_quit') }}</div>
          <div class="del-btn btn" @click="deleteDarkmodeThemeAction" v-if="actionType=='modify'">{{ $t('delete') }}</div>
        </div>
      </template>
    </div>
  </Dialog>
</template>

<script setup>
import {
  inject,
  onMounted,
  onUnmounted,
  reactive,
  markRaw,
  ref,
  toRefs,
  watch,
  nextTick,
} from 'vue';
import Input from '@/components/layout/box/Input.vue';
import Dialog from "@/components/layout/box/dialog/Dialog.vue";
import { useI18n } from 'vue-i18n';
import Pickr from '@simonwep/pickr';
import { getContext } from '@/services/Context';
import { md5Encrypt } from '@/utils/encrypt';
import toast from '@/components/layout/box/toast/index.ts';
import '@simonwep/pickr/dist/themes/monolith.min.css';

const props = defineProps({
  themeObj: {
    type: Object,
    default: () => ({})
  },
  show: {
    type: Boolean,
    default: false
  },
  actionType: {
    type: String,
    default: 'add'
  },
})
const pickerRef = ref(null);

const emit = defineEmits(["handleCallbackAction", "update:show"]);
const { t, tm } = useI18n();
const global = inject('global');
const store = global.store;
let pickrInstance = null;
const state = reactive({
  platformName: import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME,
  /** Open：无会员体系 */
  isStayPro: true,
  themeName: props.themeObj?.name || '',
  bgColor: props.themeObj?.bgColor || '#181a1b',
  textColor: props.themeObj?.textColor || '#e8e6e3',
  type: 'background',
  themeItem: props.themeObj || {},
  errorMsg: '',
  showPickerColorStatus: false,
  activatedTabMenu: store.state.popupTabMenuActivated,
});

const {activatedTabMenu, themeName, isStayPro, bgColor, textColor, errorMsg, platformName} = toRefs(state);



const initPickr = async () => {
  await nextTick();
  console.log("init colorPicker now----", state.isStayPro)
  if(!pickerRef.value && props.show){
    console.log('initPickr----pickerRef.value', pickerRef.value, pickrInstance);
    setTimeout(() => {
      initPickr();
    }, 100);
    return;
  }
  pickrInstance = Pickr.create({
    el: pickerRef.value,
    theme: 'monolith', // or 'monolith', or 'nano'
    swatches: [
      'rgba(244, 67, 54, 1)',
      'rgba(233, 30, 99, 0.95)',
      'rgba(156, 39, 176, 0.9)',
      'rgba(103, 58, 183, 0.85)',
      'rgba(63, 81, 181, 0.8)',
      'rgba(33, 150, 243, 0.75)',
      'rgba(3, 169, 244, 0.7)',
      'rgba(0, 188, 212, 0.7)',
      'rgba(0, 150, 136, 0.75)',
      'rgba(76, 175, 80, 0.8)',
      'rgba(139, 195, 74, 0.85)',
      'rgba(205, 220, 57, 0.9)',
      'rgba(255, 235, 59, 0.95)',
      'rgba(255, 193, 7, 1)'
    ],
    container: pickerRef.value.parentElement,
    autoReposition: true,
    comparison: false,
    useAsButton: true,
    position: 'bottom-middle',
    appClass: 'color-picker-wrapper',
    components: {
      // Main components
      preview: false,
      opacity: true,
      hue: true,
      // Input / output Options
      interaction: {
        hex: true,
        rgba: true,
        hsla: false,
        hsva: false,
        cmyk: false,
        input: true,
        clear: false,
        save: false
      }
    }
  });

  pickrInstance.on('init', instance => {
    console.log('Event: "init"');
  }).on('hide', instance => {
    console.log('Event: "hide"', instance._color.toHEXA().toString(), pickrInstance.getColor().toHEXA().toString());
    handleColorPicker(instance, 'hide');
    state.showPickerColorStatus = false;
  }).on('show', (color, instance) => {
    console.log('Event: "show"', color, instance);
  }).on('save', (color, instance) => {
    console.log('Event: "save"', color, instance, pickrInstance.getColor().toHEXA().toString());
    handleColorPicker(instance);
    pickrInstance.hide();
  }).on('clear', instance => {
    console.log('Event: "clear"', instance._color.toHEXA().toString());
    handleColorPicker(instance);
  }).on('change', (color, source, instance) => {
    console.log('Event: "change"', color, color.toHEXA().toString(), instance._color.toHEXA().toString(), source, instance);
    handleColorPicker(instance, 'change');
  }).on('changestop', (source, instance) => {
    console.log('Event: "changestop"', source, instance);
  }).on('cancel', instance => {
    console.log('Event: "cancel"');
  }).on('swatchselect', (color, instance) => {
    console.log('Event: "swatchselect"', color, instance);
  });
}


watch(
  props,
  async (newProps) => {
    // 接收到的props的值
    state.themeItem = newProps.themeObj || {};
    if(newProps.actionType == 'modify' && state.themeItem && Object.keys(state.themeItem).length){
      // console.log('state.themeItem-------',reactiveThemeItem)
      state.bgColor = state.themeItem.bgColor;
      state.textColor = state.themeItem.textColor;
      state.themeName = state.themeItem.name;
    }else{
      state.bgColor = '#181a1b';
      state.textColor = '#e8e6e3';
      state.themeName = "";
    }
    if(newProps.show){
      console.log("show now----")
      initPickr();
    }
  },
  { immediate: true, deep: true }
);


onMounted(()=>{
  console.log('onMounted----colorPicker---------------',pickerRef.value, state.isStayPro, state.platformName);
  initPickr();
})

onUnmounted(() => {
  pickrInstance?.destroyAndRemove();
});

const handleColorPicker = (instance, type) => {
  // toRGBA()
  const color = instance._color.toHEXA().toString();
  if('background' == state.type){
    state.bgColor = color;
  }else{
    state.textColor = color;
  }
  emit('handleCallbackAction', 'change', {bgColor:state.bgColor, textColor:state.textColor, isModify: checkThemeColorIsModify()});
}

const closePopupAction = () => {
  state.showPopup = false;
  state.errorMsg = '';
  emit('handleCallbackAction', 'closeAction', {isModify: checkThemeColorIsModify()});
}

const pickerColorAction = (type) => {
  console.log('pickerColorAction----', type, state.showPickerColorStatus);
  if(state.showPickerColorStatus){
    return;
  }
  state.type = type;
  if('background' == type){
    pickrInstance.setColor(state.bgColor);
  }else{
    pickrInstance.setColor(state.textColor);
  }
  pickrInstance.show();
  state.showPickerColorStatus = true;

}

const deleteDarkmodeThemeAction = () => {
  deleteDarkmodeTheme();
}

/**
 *
 * @param {String} type apply/quit
 */
const saveDarkmodeThemeAction = (type) => {
  if(!state.themeName){
    state.errorMsg = t('theme_name_error');
    return;
  }
  console.log("saveDarkmodeThemeAction----", props.actionType, state.themeName, state.bgColor, state.textColor)
  state.errorMsg = '';
  if(props.actionType == 'add'){
    state.themeItem.value = md5Encrypt(`${state.themeName}_${new Date().getTime()}`);
    state.themeItem.name = state.themeName;
    state.themeItem.bgColor = state.bgColor;
    state.themeItem.textColor = state.textColor;
    state.themeItem.isPro = true;
    state.themeItem.edit = true;
    saveDarkmodeTheme(type)
  }else{
    try {
      if(state.themeItem.name != state.themeName || checkThemeColorIsModify()){
        state.themeItem.name = state.themeName;
        state.themeItem.bgColor = state.bgColor;
        state.themeItem.textColor = state.textColor;
        modifyDarkmodeTheme(type)
      }else{
        // state.showPopup = false;
        // pickrInstance.destroy();
        emit('handleCallbackAction', 'closeAction', {isModify: false});
      }
    } catch (error) {
      console.log('saveDarkmodeThemeAction---error-----', error)
    }

  }
}

const checkThemeColorIsModify = () => {
  if(state.themeItem.bgColor != state.bgColor || state.themeItem.textColor != state.textColor){
    return true;
  }
  return false;
}


const saveDarkmodeTheme = (type) => {
  console.log('saveDarkmodeTheme----', markRaw(state.themeItem));
  getContext().browser.runtime.sendMessage({origin: 'popup', operate: 'darkMode/addDarkmodeTheme',  theme: markRaw(state.themeItem)}, (response) => {
    console.log('saveDarkmodeTheme response----', response);
    if (getContext().browser.runtime.lastError) {
      console.error(getContext().browser.runtime.lastError.message);
      state.errorMsg = t('submit_error');
      return;
    }
    if(!response){
      state.errorMsg = t('submit_error');
      return;
    }
    // state.showPopup = false;
    // pickrInstance.destroy();
    emit('handleCallbackAction', 'themeAction', {type, ...state.themeItem, isModify: true});
  })
}

const deleteDarkmodeTheme = () => {
  console.log('deleteDarkmodeTheme----', state.themeItem);
  getContext().browser.runtime.sendMessage({origin: 'popup', operate: 'darkMode/deleteDarkmodeTheme',  theme: state.themeItem}, (response) => {
    console.log('saveDarkmodeTheme response----', response);
    // state.showPopup = false;
    // pickrInstance.destroy();
    emit('handleCallbackAction', 'themeAction', {type: 'delete', ...state.themeItem, isModify: checkThemeColorIsModify()});
  })
}

const modifyDarkmodeTheme = (type) => {
  console.log('modifyDarkmodeTheme----', state.themeItem);
  getContext().browser.runtime.sendMessage({origin: 'popup', operate: 'darkMode/modifyDarkmodeTheme',  theme: state.themeItem}, (response) => {
    console.log('saveDarkmodeTheme response----', response);
    // state.showPopup = false;
    // pickrInstance.destroy();
    emit('handleCallbackAction', 'themeAction', {type, ...state.themeItem, isModify: true});
  })
}



</script>

<style lang="less" scoped>
.pickr{
  display: none!important;
}
.color-picker{
  display: none;
}
:deep(.theme-color-popup){
  .content{
    padding: 0 20px 20px 20px!important;
  }
}
:deep(.color-picker-wrapper){
  top: 50%!important;
  left: 50%!important;
  transform: translate(-50%, -50%);
  z-index: 100000;
}
.themes-box{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
  .theme-name{
    width: 100%;
    padding-bottom: 18px;
    position: relative;
    .error-msg{
      color: var(--stay-error);
      font-size: var(--stay-text-subfootnote);
      position: absolute;
      left: 5px;
      bottom: 4px;
    }
    .name-input{
      width: 100%;
      height: 45px;
      border: 1px solid var(--stay-border);
      border-radius: 10px;
      box-shadow: 0 0px 10px rgba(0,0,0,0.05);
      background: var(--stay-backgroundSecondary);
      font-size: var(--stay-text-subheadline);
      padding: 0 10px;
      display: flex;
      justify-content: center;
      align-items: center;
      .theme-name-input{
        height: 42px;
      }
    }
  }
  .theme-colors{
    width: 100%;
    padding-bottom: 18px;
    .colors-input{
      padding-left: 15px;
      background-color: var(--stay-backgroundSecondary);
      border-radius: 10px;
      border: 1px solid var(--stay-border);
      box-shadow: 0 0px 10px rgba(0,0,0,0.05);
      .color-name{
        font-size: var(--stay-text-subheadline);
        color: var(--stay-black);
      }
      .color-area{
        width: 28px;
        height: 28px;
        border-radius: 50%;
      }
      .color-item{
        width: 100%;
        height: 45px;
        padding-right: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .text-color{

      }
      .bg-color{
        border-bottom: 1px solid var(--stay-border);
      }

    }
  }
  .label{
    width: 100%;
    text-align: left;
    padding-bottom: 6px;
    font-size: var(--stay-text-subheadline);
    font-weight: 700;
    color: var(--stay-secondaryFont);
    padding-left: 5px;
  }
  .btn-box{
    width: 100%;
    margin-top: 5px;
    .btn{
      width: 100%;
      line-height: 45px;
      height: 45px;
      border-radius: 10px;
      text-align: center;
      font-size: var(--stay-text-subheadline);
      font-weight: 600;
      margin-bottom: 10px;
      user-select: n;
      cursor: pointer;
    }
    .save-btn{
      border: 1px solid var(--s-main);
      color: var(--s-main);
    }
    .del-btn{
      color: var(--stay-white);
      background-color: var(--stay-error);
    }
  }
}
</style>
