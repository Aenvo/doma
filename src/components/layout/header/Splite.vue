<template>
  <div class="splite flex-center" @click.stop="handleClickSplite">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.474 19h13.052c.834 0 1.455-.202 1.863-.605.407-.403.611-1.008.611-1.815V7.42c0-.807-.204-1.412-.611-1.815C19.98 5.202 19.36 5 18.526 5H5.474c-.821 0-1.439.202-1.853.605C3.207 6.008 3 6.613 3 7.42v9.16c0 .807.207 1.412.621 1.815.414.403 1.032.605 1.853.605Zm.02-1.392c-.35 0-.62-.091-.81-.274-.191-.182-.287-.456-.287-.821V7.487c0-.359.096-.63.287-.816.19-.186.46-.279.81-.279h13.012c.35 0 .62.093.81.279.191.185.287.457.287.816v9.026c0 .365-.096.639-.287.821-.19.183-.46.274-.81.274H5.494Zm3.377.268h1.368V6.152H8.87v11.724ZM7.415 9.178a.45.45 0 0 0 .33-.149c.097-.1.146-.21.146-.331a.433.433 0 0 0-.146-.322.465.465 0 0 0-.33-.14H5.882a.465.465 0 0 0-.33.14.433.433 0 0 0-.146.322c0 .121.049.232.146.331a.45.45 0 0 0 .33.149h1.533Zm0 1.92a.457.457 0 0 0 .33-.144.459.459 0 0 0 .146-.336.433.433 0 0 0-.146-.321.465.465 0 0 0-.33-.14H5.882a.465.465 0 0 0-.33.14.433.433 0 0 0-.146.321c0 .128.049.24.146.336a.457.457 0 0 0 .33.144h1.533Zm0 1.92a.465.465 0 0 0 .33-.138.443.443 0 0 0 .146-.332.433.433 0 0 0-.146-.321.465.465 0 0 0-.33-.14H5.882a.465.465 0 0 0-.33.14.433.433 0 0 0-.146.321c0 .128.049.239.146.332.097.092.207.139.33.139h1.533Z" fill="var(--stay-black)"></path></svg>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits(['click'])
const collapsed = ref<boolean>(true);

const handleClickSplite = () => {
  console.log("splite----handleClickSplite， collapsed", collapsed.value);
  collapsed.value = !collapsed.value;
  emit('click', collapsed.value);
}
</script>
<style scoped lang="less">
/* Your style code here */
.splite{
  width: 40px;
  height: 30px;
  fill: var(--stay-black);
  cursor: pointer;
  transition: all .3s;
  &:hover{
    background: var(--stay-border);
    border-radius: 6px;
    transition: all .3s;
  }
}
</style>