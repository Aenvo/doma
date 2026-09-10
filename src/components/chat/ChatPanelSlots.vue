<template></template>

<script setup lang="ts">
/** Open：版别插槽为空（无账户/下载/首次对话引导） */
defineProps<{
  position:
    | 'lead'
    | 'toolbar'
    | 'downloader-panel'
    | 'account-panel'
    | 'login-welcome'
    | 'first-chat-prompt';
}>();
</script>
