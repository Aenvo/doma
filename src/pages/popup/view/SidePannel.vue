<template>
  <div class="slider-pannel-wrapper chat-mode" data-doma-sidepannel="1">
    <div
      v-if="phase === 'loading'"
      class="sidepannel-status"
    >
      {{ loadHint || 'Loading…' }}
    </div>

    <div
      v-else-if="phase === 'error'"
      class="sidepannel-status sidepannel-status--error"
    >
      <div class="sidepannel-status-title">Failed</div>
      {{ loadError }}
      <button type="button" class="sidepannel-retry" @click="boot">
        Retry
      </button>
    </div>

    <component :is="ChatPanelComp" v-else-if="ChatPanelComp" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, type Component } from 'vue'

const phase = ref<'loading' | 'full' | 'error'>('loading')
const loadError = ref('')
const loadHint = ref('')
const ChatPanelComp = shallowRef<Component | null>(null)

async function loadFullInPlace() {
  phase.value = 'loading'
  loadHint.value = 'Loading chat…'
  try {
    const mod = await import('@/components/chat/ChatPanel.vue')
    ChatPanelComp.value = mod.default
    phase.value = 'full'
  } catch (e) {
    loadError.value = String(e)
    phase.value = 'error'
  }
}

function boot() {
  loadError.value = ''
  void loadFullInPlace()
}

onMounted(() => {
  boot()
})
</script>

<style scoped lang="less">
.slider-pannel-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sidepannel-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  color: #666;
}
.sidepannel-status--error {
  color: #b71c1c;
}
.sidepannel-status-title {
  font-weight: 600;
}
.sidepannel-retry {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
</style>
