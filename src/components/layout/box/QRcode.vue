<template>
  <div class="qrcode-container">
    <img :src="qrcodeData" :width="size" :height="size" />
    <div v-if="error" class="error-tip">{{ $t("gen_error") }}</div>
    <div v-if="message" class="message">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import QRCode from 'qrcode';

  interface Props {
    content: string;
    size?: number;
    darkColor?: string;
    lightColor?: string;
    message?: string;
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 260,
    darkColor: '#131313',
    lightColor: '#f7f7f7',
    message: ''
  });

  const qrcodeData = ref('');
  const error = ref(false);

  const generateQR = async () => {
    try {
      if (!props.content) {
        throw new Error('内容不能为空');
      }
      
      qrcodeData.value = await QRCode.toDataURL(props.content, {
        width: props.size,
        color: {
          dark: props.darkColor,
          light: props.lightColor
        },
        errorCorrectionLevel: 'H'
      });
      error.value = false;
    } catch (err) {
      console.error('The generation of the QR code has failed.', err);
      error.value = true;
    }
  };

  // 监听内容变化
  watch(() => props.content, generateQR, { immediate: true });
</script>
<style lang="less" scoped>
.qrcode-container{
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  
  .error-tip{
    color: var(--stay-secondaryFont);
    font-size: var(--stay-text-body);
  }
  .message{
    color: var(--stay-secondaryFont);
    font-size: var(--stay-text-body);
  }
}
</style>