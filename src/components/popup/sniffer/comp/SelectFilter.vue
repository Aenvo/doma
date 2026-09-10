<template>
  <div class="select-container">
    <div class="select-box">
      <label for="ratio-size">{{ $t("ratio_size") }}</label>
      <span class="operator" @click.stop="selectOperator">{{ filterOperator }}</span>
      <!-- ref="selecteRef" -->
      <div class="custom-select-wrapper">
        <span class="text-temp">
          {{ selectedRatioName }}
        </span>
        <select id="ratio-size" class="custom-select" v-model="selectedRatio" name="size" @change="changeSelectSizeRatio($event)">
          <option v-for="(o, i) in sizeList" :key="i" :name="o.ratioName" :value="o.ratio" >{{o.ratioName}}</option>
        </select>
      </div>
      
    </div>
    <div class="select-btn" @click.stop="selectSwitch(selectStatus)">{{ selectStatus == 1 ? $t("cancel_select_txt") : selectStatus == 2 ? $t("back") : $t("select_txt") }}</div>
    <RatioSizeManage :show="showManage" :size-list="sizeList" @close="closeRatioManage" @add="handleAddNewRatio" @delete="handleDeleteRatio"></RatioSizeManage>
  </div>
</template>
<script setup>
import { reactive, ref, defineEmits, inject, toRefs, watch, onUnmounted, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import RatioSizeManage from "./RatioSizeManage.vue"
import { Storage } from '@/store/Storage';
const { t } = useI18n();
const storage = Storage.init();
const props = defineProps({
  selectStatus: {
    type: Number,
    default: 0 // false0: 初始状态待选择，true1: 正在选择状态, 2: preview预览状态
  }
})

const emit = defineEmits(['selectSize', 'selectAction'])
let ratioSizeListLocalKey = {
  __stay_img_ratio_list: [{ratioName: "Min x Min", ratio: "[0,0]", protect: true}, {ratioName: t("custom_size"), ratio: "[-1,-1]", protect: false, noSetting: true}],
  __stay_filter_img: {ratioName: "Min x Min", ratio: "[0,0]", operator: ">="}, // >=/<
};
const state = reactive({
  selectedRatio: ratioSizeListLocalKey.__stay_filter_img.ratio, // [width, height]
  selectedRatioName: ratioSizeListLocalKey.__stay_filter_img.ratioName,
  lastSelectedRatio: ratioSizeListLocalKey.__stay_filter_img.ratio,
  sizeList: ratioSizeListLocalKey.__stay_img_ratio_list,
  filterOperator: ratioSizeListLocalKey.__stay_filter_img.operator,
  showManage: false,
})

storage.get("__ratioSizeListLocalKey").then(res => {
  // console.log("res----", JSON.stringify(res.__stay_img_ratio_list), Array.from(Object.entries(res.__stay_img_ratio_list)))
  if(res ){
    const jsonObject = res.__stay_img_ratio_list
    if(jsonObject){
      const list = [];
      Object.keys(jsonObject).forEach(key => {
        // console.log(`Key: ${key}, Value: ${jsonObject[key]}`);
        list.push(jsonObject[key])
      });
      state.sizeList = list
      ratioSizeListLocalKey.__stay_img_ratio_list = list;
    }
    const filterImg = res.__stay_filter_img;
    if(filterImg){
      state.selectedRatio = filterImg.ratio;
      state.lastSelectedRatio = filterImg.ratio;
      state.filterOperator = filterImg.operator;
      handleProvideFilter()
    }
  }
})

const { showManage, sizeList, selectedRatio, selectedRatioName, filterOperator} = toRefs(state)

const selectSwitch = (status) => {
  let toStatus = 0;
  // 0: 初始状态待选择，1: 正在选择状态, 2: preview预览状态
  if(status == 0){
    toStatus = 1;
  }else{
    toStatus = 0
  }
  // 正在选择状态
  emit("selectAction", toStatus)
}

onMounted(()=>{
  
})

const handleAddNewRatio = (width, height) => {
  const newRatio = {ratioName: `${width} x ${height}`, ratio: `[${width},${height}]` }
  // console.log("state.sizeList----", state.sizeList)
  state.sizeList.splice(state.sizeList.length - 1, 0, newRatio);
  handleRatioSizeToLocal()
}

const handleDeleteRatio = (index) => {
  state.sizeList.splice(index, 1);
  handleRatioSizeToLocal()
}

const handleRatioSizeToLocal = () => {
  ratioSizeListLocalKey.__stay_img_ratio_list = state.sizeList;
  ratioSizeListLocalKey.__stay_filter_img = {ratioName: state.selectedRatioName, ratio: state.selectedRatio, operator: state.filterOperator}
  storage.set("__ratioSizeListLocalKey", ratioSizeListLocalKey) 
}


const changeSelectSizeRatio = (event) => {
  const selectOpt = event.target;
  state.selectedRatioName = selectOpt.name
  console.log(selectOpt.name, selectOpt.value, state.selectedRatio);
  if(selectOpt.value == "[-1,-1]"){
    state.showManage = true;
    state.selectedRatio = state.lastSelectedRatio;
  }else{
    state.selectedRatio = selectOpt.value
    state.lastSelectedRatio = selectOpt.value;
    // const selectedValue = JSON.parse(selectOpt.value)
    handleProvideFilter(true)
  }
}

const selectOperator = () => {
  if(state.filterOperator == ">="){
    if(state.selectedRatio != "[0,0]"){
      state.filterOperator = "<";
    }
    // state.filterOperator = "<";
  }else{
    state.filterOperator = ">="
  }
  handleProvideFilter(true);
}

const handleProvideFilter = (shouldWrite) => {
  const selectedValue = JSON.parse(state.selectedRatio)
  emit("selectSize", selectedValue, state.filterOperator)
  shouldWrite && handleRatioSizeToLocal();
}

const closeRatioManage = () => {
  state.showManage = false;
}



</script>
<style lang="less" scoped>
.select-container{
  width: 100%;
  height: 45px;
  background-color: var(--stay-background);
  display: flex;
  justify-content: space-between;
  padding: 0 10px;
  align-items: center;
  position: fixed;
  top: 74px;
  z-index: 999999;
  left: 0;
  right: 0;
  .select-box{
    max-width: 240px;
    min-width: 150px;
    height: 25px;
    border-radius: 8px;
    // background-color: var(--stay-backgroundSecondary);
    display: flex;
    // flex: 1;
    justify-content: flex-start;
    padding: 0 0px 0 5px;
    align-items: center;
    position: relative;
    label{
      font-size: var(--stay-text-subbody);
      font-weight: 700;
      color: var(--stay-secondaryFont);
      padding-right: 10px;
    }
    .operator{
      width: 30px;
      height: 25px;
      line-height: 25px;
      background: var(--stay-backgroundSecondary);
      padding: 0px 6px;
      text-align: center;
      font-size: var(--stay-text-subbody);
      font-weight: 700;
      color: var(--stay-secondaryFont);
      border-radius: 8px;
    }
    .custom-select-wrapper{
      width: 100%;
      margin-left: 10px;
      height: 25px;
      display: flex;
      flex: 1;
      font-size: var(--stay-text-subbody);
      position: relative;
      padding-right: 25px;
      border-radius: 8px;
      background-color: var(--stay-backgroundSecondary);
      padding: 0 22px 0 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      .text-temp{
        font-size: var(--stay-text-subbody);
        padding: 0 2px;
        color: transparent;
        width: 80px;
        max-width: 100px;
      }
      .custom-select {
        font-size: var(--stay-text-subbody);
        color: var(--s-main);
        font-weight: 700;
        width: 100%;
        height: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        -webkit-box-orient: vertical;
        position: absolute;
        left: 0;
        top: 0;
        z-index: 999;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        background-color: transparent;
        padding-left: 10px;
        padding-right: 22px;
      }
      &::after{
        content: "";
        width: 16px;
        height: 25px;
        position: absolute;
        top: 50%;
        right: -14px;
        z-index: 100;
        transform: translateY(-50%);
        overflow: hidden;
        background: url("@/assets/popup/option.png") no-repeat 50% 50%;
        background-size: 15px;
        filter: drop-shadow(var(--s-main) -18px 0);
        border-left: 18px solid transparent;

      }
    }
    
    // &::after{
    //   background: url("@/assets/popup/option.png") no-repeat 50% 50%;
    //   background-size: contain;
    //   content: "";
    //   position: absolute;
    //   right: 10px;
    //   top: 50%;
    //   transform: translate(0, -50%);
    //   width: 12px;
    //   height: 20px;
    //   z-index: 777;
    // }
    
  }
  .select-btn{
    width: 94px;
    height: 25px;
    border-radius: 8px;
    text-align: center;
    line-height: 25px;
    background-color: var(--stay-backgroundSecondary);
    font-size: var(--stay-text-subbody);
    color: var(--s-main);
    font-weight: 700;
    cursor: default;
  }
}
</style>