<template>
  <div ref="connectorRoot" class="connector-panel" :style="maxPanelHeight === null ? undefined : { maxHeight: `${maxPanelHeight}px` }">
    <div class="connector-tabs" role="tablist">
      <button
        type="button"
        class="connector-tab"
        role="tab"
        :aria-selected="tab === 'mcp'"
        :class="{ active: tab === 'mcp' }"
        @click="tab = 'mcp'"
      >
        {{ t("chat.connector.tabMcp") }}
      </button>
      <button
        type="button"
        class="connector-tab"
        role="tab"
        :aria-selected="tab === 'cli'"
        :class="{ active: tab === 'cli' }"
        @click="tab = 'cli'"
      >
        {{ t("chat.connector.tabCliRunner") }}
      </button>
    </div>

    <div class="connector-body">
      <McpProviderPanel
        v-show="tab === 'mcp'"
        :open="open && tab === 'mcp'"
        @bridge-enabled-change="(v) => emit('bridge-enabled-change', v)"
        @bridge-ensure="emit('bridge-ensure')"
      />
      <CliRunnerPanel
        v-show="tab === 'cli'"
        :open="open && tab === 'cli'"
        @cli-bridge-enabled-change="(v) => emit('cli-bridge-enabled-change', v)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import McpProviderPanel from "@/components/chat/McpProviderPanel.vue";
import CliRunnerPanel from "@/components/chat/CliRunnerPanel.vue";

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "bridge-enabled-change", enabled: boolean): void;
  (e: "cli-bridge-enabled-change", enabled: boolean): void;
  (e: "bridge-ensure"): void;
}>();

const { t } = useI18n();
const tab = ref<"mcp" | "cli">("mcp");
const connectorRoot = ref<HTMLElement | null>(null);
const maxPanelHeight = ref<number | null>(null);
let resizeObserver: ResizeObserver | null = null;

function updateMaxPanelHeight() {
  const root = connectorRoot.value;
  const composer = root?.closest(".chat-panel")?.querySelector<HTMLElement>(".chat-input-row");
  if (!root || !composer) return;
  maxPanelHeight.value = Math.max(0, Math.floor(composer.getBoundingClientRect().top - root.getBoundingClientRect().top - 8));
}

onMounted(() => {
  const panel = connectorRoot.value?.closest(".chat-panel");
  const composer = panel?.querySelector<HTMLElement>(".chat-input-row");
  resizeObserver = new ResizeObserver(updateMaxPanelHeight);
  if (panel) resizeObserver.observe(panel);
  if (composer) resizeObserver.observe(composer);
  window.addEventListener("resize", updateMaxPanelHeight);
  void nextTick(updateMaxPanelHeight);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", updateMaxPanelHeight);
});
</script>

<style scoped lang="less">
.connector-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 在首次测量前保留视口高度回退值。 */
  max-height: calc(100vh - 320px);
  max-height: calc(100dvh - 320px);
}

.connector-tabs {
  flex: 0 0 auto;
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--stay-border, #333);
}

.connector-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--stay-labelSecondary, #888);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;

  &.active {
    color: var(--stay-black);
    border-bottom-color: var(--stay-primary, #2f3134);
  }
}

.connector-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--stay-black) 35%, transparent)
    color-mix(in srgb, var(--stay-border, #d0d0d0) 55%, transparent);

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    margin: 4px 0;
    background: color-mix(in srgb, var(--stay-border, #d0d0d0) 55%, transparent);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--stay-black) 35%, transparent);
    border-radius: 4px;

    &:hover {
      background: color-mix(in srgb, var(--stay-black) 55%, transparent);
    }
  }
}
</style>
