<template>
  <div class="sniffer-null">
    <div class="null-title">{{ title }}</div>
    <div class="desc-prompt">{{ desc }}</div>
    <div class="operation">
      <div class="mail-to" @click="contactClick">{{ $t('contact_us') }}</div>
      <div class="or">{{ $t("or") }}</div>
      <div class="retry" @click="retryAction">{{ $t("retry") }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { defineEmits, reactive, getCurrentInstance, inject, toRefs, watch, onUnmounted, defineProps } from 'vue'

const emit = defineEmits(['tabChange'])
const { t } = useI18n();
const props = defineProps({
  title: {
    type: String,
    default: ""
  },
  desc: {
    type: String,
    default: ""
  }
})

const contactClick = () => {
  emit("contactAction")
}

const retryAction = () => {
  emit("retryAction")
}

</script>

<style lang="less" scoped>
.sniffer-null{
  width: 100%;
  padding: 70px 10px 20px 10px;
  font-size: var(--stay-text-subheadline);
  font-weight: 400;
  height: 100%;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  cursor: default;
  .null-title{
    color: var(--stay-black);
    user-select: none;
  }
  .desc-prompt{
    // color: var(--s-7a);
    color: var(--stay-secondaryFont);
    font-size: var(--stay-text-subheadline);
    line-height: 25px;
    user-select: none;
  }
  .operation{
    display: flex;
    justify-content: center;
    align-items: center;
    padding-top: 5px;
    .mail-to, .retry{
      display: inline;
      text-decoration: underline;
      color: var(--stay-black);
      font-weight: 700;
      font-size: var(--stay-text-subheadline);
      // padding-left: 2px;
      cursor: pointer;
    }
    .or{
      margin: 0 10px;
      font-size: var(--stay-text-subbody);
      color: var(--stay-black);
    }
    // .retry{
    //   border: 1px solid var(--s-main);
    //   font-size: var(--stay-text-subbody);
    //   border-radius: 5px;
    //   padding: 1px 10px;
    //   color: var(--s-main);
    //   cursor: pointer;
    // }
  }
}
</style>