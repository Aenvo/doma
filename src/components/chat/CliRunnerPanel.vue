<template>
  <div class="cli-panel">
    <p class="cli-desc">{{ t("chat.cliRunner.desc") }}</p>

    <div class="cli-toggle-row">
      <div class="cli-toggle-copy">
        <div class="cli-toggle-title">{{ t("chat.cliRunner.bridgeToggle") }}</div>
        <p class="cli-toggle-hint">{{ t("chat.cliRunner.bridgeToggleHint") }}</p>
      </div>
      <button
        type="button"
        class="cli-switch"
        :class="{ on: bridgeEnabled }"
        role="switch"
        :aria-checked="bridgeEnabled"
        :disabled="toggleBusy"
        :title="t('chat.cliRunner.bridgeToggle')"
        @click="toggleBridgeEnabled"
      >
        <span class="cli-switch-knob" aria-hidden="true" />
      </button>
    </div>

    <div class="cli-status-row">
      <span
        class="cli-status-dot"
        :class="{ on: bridgeEnabled && (running || bridgeConnected), off: !bridgeEnabled }"
      />
      <span class="cli-status-text">
        {{
          !bridgeEnabled
            ? t("chat.cliRunner.bridgeDisabled")
            : bridgeConnected
              ? t("chat.cliRunner.bridgeOn")
              : running
                ? t("chat.cliRunner.running")
                : t("chat.cliRunner.stopped")
        }}
      </span>
      <span v-if="bridgeEnabled && running && version" class="cli-status-ver">v{{ version }}</span>
      <button type="button" class="cli-refresh-btn" @click="refreshHealth">
        {{ t("chat.cliRunner.refresh") }}
      </button>
    </div>

    <div class="cli-section">
      <div class="cli-section-title">{{ t("chat.cliRunner.installTitle") }}</div>
      <p class="cli-hint">{{ t("chat.cliRunner.installHint") }}</p>
      <pre class="cli-code">{{ installCommand }}</pre>
      <button type="button" class="cli-copy-btn" @click="copyText(installCommand, 'install')">
        {{ copied === "install" ? t("chat.cliRunner.copied") : t("chat.cliRunner.copyInstall") }}
      </button>
    </div>

    <div class="cli-section">
      <div class="cli-section-title">{{ t("chat.cliRunner.controlTitle") }}</div>
      <p class="cli-hint">{{ t("chat.cliRunner.controlHint") }}</p>
      <pre class="cli-code">{{ startCommand }}</pre>
      <button type="button" class="cli-copy-btn" @click="copyText(startCommand, 'start')">
        {{ copied === "start" ? t("chat.cliRunner.copied") : t("chat.cliRunner.copyStart") }}
      </button>
      <pre class="cli-code cli-code-spaced">{{ stopCommand }}</pre>
      <button type="button" class="cli-copy-btn" @click="copyText(stopCommand, 'stop')">
        {{ copied === "stop" ? t("chat.cliRunner.copied") : t("chat.cliRunner.copyStop") }}
      </button>
    </div>

    <div class="cli-section">
      <div class="cli-section-title">{{ t("chat.cliRunner.catalogTitle") }}</div>
      <p class="cli-hint">{{ t("chat.cliRunner.catalogHint") }}</p>

      <div class="cli-catalog-form">
        <input
          v-model="newName"
          class="cli-input"
          type="text"
          :placeholder="t('chat.cliRunner.catalogNamePlaceholder')"
          @keydown.enter.prevent="onAddEntry"
        />
        <textarea
          v-model="newDesc"
          class="cli-textarea"
          rows="2"
          :placeholder="t('chat.cliRunner.catalogDescPlaceholder')"
        />
        <button
          type="button"
          class="cli-copy-btn cli-add-btn"
          :disabled="adding"
          @click="onAddEntry"
        >
          {{ t("chat.cliRunner.catalogAdd") }}
        </button>
        <p v-if="catalogError" class="cli-error">{{ catalogError }}</p>
      </div>

      <ul v-if="entries.length" class="cli-catalog-list">
        <li v-for="item in entries" :key="item.id" class="cli-catalog-item">
          <div class="cli-catalog-meta">
            <div class="cli-catalog-name">{{ item.name }}</div>
            <div v-if="item.description" class="cli-catalog-desc">{{ item.description }}</div>
          </div>
          <button
            type="button"
            class="cli-del-btn"
            @click="onRemoveEntry(item.id)"
          >
            {{ t("chat.cliRunner.catalogDelete") }}
          </button>
        </li>
      </ul>
      <p v-else class="cli-hint cli-empty">{{ t("chat.cliRunner.catalogEmpty") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  CLI_RUNNER_INSTALL_COMMAND,
  CLI_RUNNER_START_COMMAND,
  CLI_RUNNER_STOP_COMMAND,
  fetchCliRunnerHealth,
} from "@/services/cliRunner/cliRunnerClient";
import {
  addUserCliEntry,
  loadUserCliEntries,
  removeUserCliEntry,
  type UserCliEntry,
} from "@/services/cliRunner/cliCatalog";
import {
  isCliBridgeEnabled,
  setCliBridgeEnabled,
} from "@/services/chat/mcpBridgePrefs";
import {
  DOMA_CLI_BRIDGE_PORT,
  isBridgePortConnected,
} from "@/services/chat/mcpBridgeClient";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "cli-bridge-enabled-change", enabled: boolean): void;
}>();

const { t } = useI18n();

const installCommand = CLI_RUNNER_INSTALL_COMMAND;
const startCommand = CLI_RUNNER_START_COMMAND;
const stopCommand = CLI_RUNNER_STOP_COMMAND;

const bridgeEnabled = ref(false);
const bridgeConnected = ref(false);
const toggleBusy = ref(false);
const running = ref(false);
const version = ref("");
const copied = ref<"" | "install" | "start" | "stop">("");
const entries = ref<UserCliEntry[]>([]);
const newName = ref("");
const newDesc = ref("");
const catalogError = ref("");
const adding = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function loadEnabled() {
  try {
    bridgeEnabled.value = await isCliBridgeEnabled();
    emit("cli-bridge-enabled-change", bridgeEnabled.value);
  } catch (e) {
    console.warn("[CliRunnerPanel] getEnabled failed", e);
    bridgeEnabled.value = false;
    emit("cli-bridge-enabled-change", false);
  }
}

async function toggleBridgeEnabled() {
  if (toggleBusy.value) return;
  toggleBusy.value = true;
  const next = !bridgeEnabled.value;
  try {
    await setCliBridgeEnabled(next);
    bridgeEnabled.value = next;
    emit("cli-bridge-enabled-change", next);
    if (!next) bridgeConnected.value = false;
    else void refreshHealth();
  } catch (e) {
    console.warn("[CliRunnerPanel] setEnabled failed", e);
  } finally {
    toggleBusy.value = false;
  }
}

async function refreshHealth() {
  const health = await fetchCliRunnerHealth();
  running.value = health.running;
  version.value = health.version || "";
  bridgeConnected.value = bridgeEnabled.value && isBridgePortConnected(DOMA_CLI_BRIDGE_PORT);
}

async function refreshCatalog() {
  entries.value = await loadUserCliEntries();
}

function startPolling() {
  stopPolling();
  void loadEnabled();
  void refreshHealth();
  void refreshCatalog();
  pollTimer = setInterval(() => void refreshHealth(), 10_000);
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function copyText(text: string, kind: "install" | "start" | "stop") {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = "";
    }, 1600);
  } catch (e) {
    console.warn("[CliRunnerPanel] copy failed", e);
  }
}

async function onAddEntry() {
  catalogError.value = "";
  const name = newName.value.trim();
  if (!name) {
    catalogError.value = t("chat.cliRunner.catalogNameRequired");
    return;
  }
  adding.value = true;
  try {
    await addUserCliEntry({ name, description: newDesc.value });
    newName.value = "";
    newDesc.value = "";
    await refreshCatalog();
  } catch (e: any) {
    if (e?.message === "name_exists") {
      catalogError.value = t("chat.cliRunner.catalogNameExists");
    } else if (e?.message === "name_required") {
      catalogError.value = t("chat.cliRunner.catalogNameRequired");
    } else {
      catalogError.value = e?.message || String(e);
    }
  } finally {
    adding.value = false;
  }
}

async function onRemoveEntry(id: string) {
  catalogError.value = "";
  try {
    await removeUserCliEntry(id);
    await refreshCatalog();
  } catch (e) {
    console.warn("[CliRunnerPanel] remove failed", e);
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) startPolling();
    else stopPolling();
  },
  { immediate: true },
);

onMounted(() => {
  if (props.open) startPolling();
  else void loadEnabled();
});

onUnmounted(() => {
  stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped lang="less">
.cli-panel {
  padding: 10px 12px 14px;
  color: var(--stay-black);
}

.cli-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--stay-labelSecondary, #888);
}

.cli-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #333);
  background: var(--stay-backgroundSecondary, transparent);
}

.cli-toggle-copy {
  flex: 1;
  min-width: 0;
}

.cli-toggle-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.cli-toggle-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--stay-labelSecondary, #888);
}

.cli-switch {
  flex: 0 0 auto;
  position: relative;
  width: 42px;
  height: 24px;
  margin-top: 2px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: var(--stay-border, #d0d0d0);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  &.on {
    background: var(--stay-primary);
  }
}

.cli-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.2s ease;
  pointer-events: none;
}

.cli-switch.on .cli-switch-knob {
  transform: translateX(18px);
}

.cli-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}

.cli-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #bbb;
  &.on {
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
  }
  &.off {
    background: #bbb;
    box-shadow: none;
  }
}

.cli-status-ver {
  color: var(--stay-labelSecondary, #888);
}

.cli-refresh-btn {
  margin-left: auto;
  border: 1px solid var(--stay-border, #333);
  background: transparent;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: inherit;
}

.cli-section {
  margin-top: 12px;
}

.cli-section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.cli-hint {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--stay-labelSecondary, #888);
}

.cli-empty {
  margin-top: 8px;
}

.cli-code {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--stay-backgroundSecondary, #1a1a1a);
  border: 1px solid var(--stay-border, #333);
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.cli-code-spaced {
  margin-top: 8px;
}

.cli-copy-btn {
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  background: var(--stay-border, #333);
  color: var(--stay-black);
  &:hover {
    filter: brightness(1.08);
  }
  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }
}

.cli-catalog-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cli-input,
.cli-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--stay-border, #333);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: var(--stay-backgroundSecondary, transparent);
  resize: vertical;
}

.cli-add-btn {
  margin-top: 0;
  align-self: flex-start;
  background: var(--stay-primary, #2f3134);
  color: var(--stay-white, #fff);
}

.cli-error {
  margin: 0;
  font-size: 11px;
  color: var(--stay-error, #ff3b30);
}

.cli-catalog-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cli-catalog-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #333);
  background: var(--stay-backgroundSecondary, transparent);
}

.cli-catalog-meta {
  flex: 1;
  min-width: 0;
}

.cli-catalog-name {
  font-size: 12px;
  font-weight: 650;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.cli-catalog-desc {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--stay-labelSecondary, #888);
  word-break: break-word;
}

.cli-del-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--stay-error, #ff3b30);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}
</style>
