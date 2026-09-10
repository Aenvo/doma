<template>
  <Dialog :show="show" :title="$t('size_setting')" @close="clickClose" animation="push-to-top" model="mobile">
    <div class="content-box">
      <div class="size-list"  v-if="showList">
        <template v-for="(item, index) in sizeList">
          <div :key="index" class="item-box" v-if="!item.noSetting">
            <div class="info" :protect="item.protect || false"  >{{ item.ratioName }}</div>
            <div class="delete" v-if="!item.protect" @click="deleteRatioItem(index)"></div>
          </div>
        </template>
      </div>
      <div class="input-size" v-else>
        <div class="ratio-width">
          <label for="ratio-width">{{ $t("ratio_width") }} <span v-if="widthError">{{ widthError }}</span></label>
          <input id="ratio-width" type="number" v-model="addWidth" @input="handleInput('width')">
        </div>
        <div class="ratio-height">
          <label for="ratio-height">{{ $t("ratio_height") }} <span v-if="heightError">{{ heightError }}</span></label>
          <input id="ratio-height" type="number" v-model="addHeight" @input="handleInput('height')">
        </div>
      </div>
    </div>
    <div class="btn-box">
      <div class="btn" @click="newSizeRatioAction">{{ showList ? $t("new_size") : $t("add") }}</div>
    </div>
  </Dialog>
</template>
<script setup>
import { reactive, ref, defineEmits, inject, toRefs, watch, onUnmounted, defineProps, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from "@/components/layout/box/dialog/Dialog.vue";


const { t } = useI18n();
const emit = defineEmits(["close", "add", "delete"])
const props = defineProps({
  sizeList: {
    type: Array,
    default: () => [{ratioName: "Min x Min", ratio: "[0,0]", protect: true}]
  },
  show: {
    type: Boolean,
    default: false
  },
})
const state = reactive({
  showPannel: props.show,
  showList: true,
  addWidth: '',
  addHeight: '',
  widthError: '',
  heightError: ''
})

const { showPannel, addWidth, addHeight, showList, heightError, widthError} = toRefs(state)

watch(props, (newProps) => {
  state.showPannel = newProps.show
  
},{ immediate: true, deep: true })

const clickClose = () => {
  emit("close")
  state.showList = true;
}

const newSizeRatioAction = () => {
  if(state.showList){
    state.showList = false
  }else{
    // 新增大小 todo
    if(state.heightError || state.widthError){
      return;
    }
    if(!state.addWidth){
      state.widthError = t("size_less_0")
      return;
    }
    if(!state.addHeight){
      state.heightError = t("size_less_0")
      return;
    }
    emit("add", state.addWidth, state.addHeight)
    
    state.showList = true;
  }
  
}

const deleteRatioItem = (index) => {
  emit("delete", index)
}

const handleInput = (type) => {
  if(type == "width"){
    // console.log("state.addWidth----", state.addWidth)
    if(state.addWidth <= 0){
      state.widthError = t("size_less_0")
    }
    else if(state.addWidth > 4800){
      state.widthError = t("size_greater_4800")
    }else{
      state.widthError = ""
    }

  }else if(type == "height"){
    if(state.addHeight <= 0){
      state.heightError = t("size_less_0")
    }
    else if(state.addHeight > 4800){
      state.heightError = t("size_greater_4800")
    }
    else{
      state.heightError =""
    }
  }
}


</script>
<style lang="less" scoped>
.content-box{
  width: 100%;
  height: 100%;
  display: flex;
  flex: 1;
  overflow-y: auto;
  padding-top: 10px;
  padding-bottom: 20px;
  .size-list{
    width: 100%;
    height: fit-content;
    background-color: var(--stay-backgroundSecondary);
    border-radius: 10px;
    padding: 10px;
    .item-box{
      width: 100%;
      padding-left: 5px;
      display: flex;
      height: 40px;
      justify-content: center;
      align-items: center;
      .info{
        width: 100%;
        display: flex;
        flex: 1;
        color: var(--stay-black);
        position: relative;
        text-align: left;
        font-size: var(--stay-text-subheadline);
      }
      .delete{
        width: 30px;
        height: 30px;
        background: url("@/assets/popup/rule-delete.png") no-repeat 70% 50%;
        background-size: 50%;
      }
    }
  }
  .input-size{
    width: 100%;
    .ratio-width,.ratio-height{
      width: 100%;
      height: 85px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      label{
        padding-bottom: 5px;
        padding-left: 5px;
        font-size: var(--stay-text-subheadline);
        font-weight: 700;
        color: var(--stay-secondaryFont);
        position: relative;
        span{
          // position: absolute;
          padding-left: 20px;
          font-weight: 400;
          color: var(--stay-error);
          font-size: var(--stay-text-subbody);
        }
      }
    }
    input{
      color: var(--stay-black);
      font-size: var(--stay-text-subheadline);
      // font-weight: 700;
      width: 100%;
      height: 40px;
      border-radius: 10px;
      padding: 0 15px;
    }

  }
}
.btn-box{
  position: sticky;
  bottom: 0;
  left: 0;
  width: 100%;
  background-color: var(--stay-backgroundFirst);
  height: 80px;
  padding: 15px 0px 25px 0px;
  .btn{
    width: 100%;
    border: 1px solid var(--s-main);
    height: 40px;
    line-height: 39px;
    text-align: center;
    border-radius: 10px;
    font-size: var(--stay-text-subheadline);
    font-weight: 700;
    color: var(--s-main);
    cursor: default;
  }
}

</style>