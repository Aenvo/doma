<template>
  <div class="search-box" :style="{width: width}">
    <div class="logo flex-center" v-if="withLogo">
      <img src="@/assets/images/stay-browser@3x.png">
    </div>
    <form class="search-form">
      <div class="input-item">
        <textarea type="text" 
          :placeholder="t('search.placeholder')"
          maxlength="2048" 
          rows="1" 
          aria-autocomplete="both" 
          aria-expanded="true" 
          aria-haspopup="false" 
          autocapitalize="off" 
          autocomplete="off" 
          autocorrect="off"
          autofocus="true"
          v-model="searchQuery"
          @keydown.enter.prevent="handleSearch"
         />
        <span class="btn">
          <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
        </span>
      </div>
    </form>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps({
  width: {
    type: String,
    default: '600px'
  },
  withLogo: {
    type: Boolean,
    default: true
  }
})

const searchQuery = ref<string>('');

const handleSearch = () => {
  if (searchQuery.value != "") {
    // 执行搜索操作
    console.log('Searching for:', searchQuery.value);
  }
};

</script>
<style scoped lang="less">
.search-box{
  width: 600px;
  margin: 0 auto;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  .logo{
    width: 40px;
    height: 40px;
    img{
      width: 32px;
      height: auto;
    }
  }
  
  .search-form{
    width: 100%;
    height: 45px;
    .input-item{
      display: flex;
      width: 100%;
      height: 100%;
      justify-content: center;
      align-items: center;
      background-color: var(--stay-backgroundSecondary);
      border-radius: 23px;
      border: 1px solid var(--stay-border);
      padding: 0 14px;
      box-shadow: 0px 2px 8px 0px rgba(60, 64, 67, 0.25);
      textarea{
        width: 100%;
        height: 100%;
        resize: none;
        background: none;
        white-space: nowrap;
        overflow: hidden;
        color: var(--stay-black);
        font-size: var(--stay-text-headline);
        line-height: 43px;
        border: none;
        opacity: 1;
      }
      textarea::-webkit-input-placeholder{color: var(--stay-placeholder);font-size: var(--stay-text-headline);font-weight: 500;}
      textarea:-moz-placeholder{color: var(--stay-placeholder);font-size: var(--stay-text-headline);font-weight: 500;}
      textarea::-moz-placeholder{color: var(--stay-placeholder);font-size: var(--stay-text-headline);font-weight: 500;}

      .btn{
        width: 24px;
        height: 24px;
        fill: var(--stay-gray);
      }
    }
    
    
  }
}
</style>