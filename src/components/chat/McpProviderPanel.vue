<template>
  <div class="mcp-panel">
    <div class="mcp-body">
      <p class="mcp-desc">{{ t("chat.mcp.providerDesc") }}</p>

      <div v-if="supportsNativeManager" class="mcp-manager-card">
        <div class="mcp-manager-heading">
          <strong>{{ t("chat.mcp.managerTitle") }}</strong>
          <button type="button" class="mcp-copy-btn" :disabled="managerBusy" @click="refreshManager">
            {{ t("chat.mcp.refresh") }}
          </button>
        </div>
        <p class="mcp-manager-line">{{ t("chat.mcp.extensionVersion", { version: extensionVersion }) }}</p>
        <template v-if="managerStatus">
          <p class="mcp-manager-line">{{ t("chat.mcp.managerVersion", { version: managerStatus.managerVersion }) }}</p>
          <p v-if="!managerCompatible" class="mcp-manager-line mcp-manager-warning">{{ t("chat.mcp.managerOutdated") }}</p>
          <p class="mcp-manager-line">
            {{ managerStatus.installed
              ? t("chat.mcp.companionVersion", { version: managerStatus.installedVersion || t("chat.mcp.unknownVersion") })
              : t("chat.mcp.companionMissing") }}
          </p>
          <p class="mcp-manager-line">
            {{ managerStatus.daemonRunning
              ? t("chat.mcp.daemonRunning", { version: managerStatus.daemonVersion || t("chat.mcp.unknownVersion") })
              : t("chat.mcp.daemonStopped") }}
          </p>
          <p class="mcp-manager-line" :class="{ 'mcp-manager-warning': !versionCompatible }">
            {{ versionCompatible
              ? t("chat.mcp.versionCompatible")
              : installedVersionNewer
                ? t("chat.mcp.extensionOutdated")
                : t("chat.mcp.versionMismatch", { version: mcpRelease.version }) }}
          </p>
          <p class="mcp-manager-line" :class="{ 'mcp-manager-warning': releaseReady === false }">
            {{ releaseReady === null ? t("chat.mcp.releaseChecking") : releaseReady ? t("chat.mcp.releaseReady") : t("chat.mcp.releaseUnavailable") }}
          </p>
          <div class="mcp-manager-actions">
            <button v-if="!versionCompatible && !installedVersionNewer" type="button" class="mcp-copy-btn" :disabled="managerBusy || releaseReady !== true || !managerCompatible" @click="runManagerAction('upgrade')">
              {{ managerStatus.installed ? t("chat.mcp.upgrade") : t("chat.mcp.installCompanion") }}
            </button>
            <button v-if="managerStatus.installed" type="button" class="mcp-copy-btn" :disabled="managerBusy || !managerCompatible" @click="runManagerAction(managerStatus.daemonRunning ? 'stop' : 'start')">
              {{ managerStatus.daemonRunning ? t("chat.mcp.stopDaemon") : t("chat.mcp.startDaemon") }}
            </button>
            <button v-if="managerStatus.installed" type="button" class="mcp-copy-btn mcp-manager-remove" :disabled="managerBusy || !managerCompatible" @click="runManagerAction('uninstall')">
              {{ t("chat.mcp.uninstallCompanion") }}
            </button>
          </div>
          <p v-if="uninstallHelpVisible && managerStatus.installed && managerStatus.agentCount > 0" class="mcp-manager-line mcp-manager-warning" role="status">
            {{ t("chat.mcp.uninstallBlockedAgents", { count: managerStatus.agentCount }) }}
          </p>
        </template>
        <template v-else>
          <p class="mcp-manager-line mcp-manager-warning">{{ t("chat.mcp.managerMissing") }}</p>
          <p class="mcp-manager-line" :class="{ 'mcp-manager-warning': releaseReady === false }">
            {{ releaseReady === null ? t("chat.mcp.releaseChecking") : releaseReady ? t("chat.mcp.releaseReady") : t("chat.mcp.releaseUnavailable") }}
          </p>
        </template>
        <p v-if="managerError" class="mcp-manager-line mcp-manager-warning">{{ managerError }}</p>
      </div>

      <div class="mcp-toggle-row">
        <div class="mcp-toggle-copy">
          <div class="mcp-toggle-title">{{ t("chat.mcp.bridgeToggle") }}</div>
          <p class="mcp-toggle-hint">{{ t("chat.mcp.bridgeToggleHint") }}</p>
        </div>
        <button
          type="button"
          class="mcp-switch"
          :class="{ on: bridgeEnabled }"
          role="switch"
          :aria-checked="bridgeEnabled"
          :disabled="toggleBusy"
          :title="t('chat.mcp.bridgeToggle')"
          @click="toggleBridgeEnabled"
        >
          <span class="mcp-switch-knob" aria-hidden="true" />
        </button>
      </div>

      <div class="mcp-status-row">
        <span class="mcp-status-dot" :class="{ on: bridgeConnected, off: !bridgeEnabled }" />
        <span class="mcp-status-text">
          {{
            !bridgeEnabled
              ? t("chat.mcp.bridgeDisabled")
              : bridgeConnected
                ? t("chat.mcp.bridgeOn")
                : t("chat.mcp.bridgeOff")
          }}
        </span>
        <span v-if="bridgeEnabled && agentCount > 0" class="mcp-status-agents">
          {{ t("chat.mcp.agentsConnected", { count: agentCount }) }}
        </span>
      </div>

      <div class="mcp-section">
        <div class="mcp-section-title">{{ t("chat.mcp.installTitle") }}</div>
        <p class="mcp-hint">
          {{ supportsNativeManager
            ? t(isWindows ? "chat.mcp.installHintWindows" : "chat.mcp.installHintUnix")
            : t("chat.mcp.installHintLegacy") }}
        </p>
        <pre class="mcp-code">{{ installCommand }}</pre>
        <button type="button" class="mcp-copy-btn" aria-live="polite" @click="copyText(installCommand, 'cmd')">
          <ChatCheckmarkSvg v-if="cmdCopied" class="mcp-copy-check" aria-hidden="true" />
          {{ cmdCopied ? t("chat.mcp.copiedCmd") : copyFailed === "cmd" ? t("chat.mcp.copyFailed") : t("chat.mcp.copyCmd") }}
        </button>
      </div>

      <div class="mcp-section">
        <div class="mcp-section-title">{{ t("chat.mcp.configTitle") }}</div>
        <p class="mcp-hint">{{ t("chat.mcp.configHint") }}</p>
        <div class="mcp-section-subtitle">Codex</div>
        <pre class="mcp-code">{{ codexConfig }}</pre>
        <button type="button" class="mcp-copy-btn" aria-live="polite" @click="copyText(codexConfig, 'codex')">
          <ChatCheckmarkSvg v-if="codexCopied" class="mcp-copy-check" aria-hidden="true" />
          {{ codexCopied ? t("chat.mcp.copiedCodexConfig") : copyFailed === "codex" ? t("chat.mcp.copyFailed") : t("chat.mcp.copyCodexConfig") }}
        </button>
        <div class="mcp-section-subtitle">{{ t("chat.mcp.otherAgentConfig") }}</div>
        <pre class="mcp-code">{{ configJson }}</pre>
        <button type="button" class="mcp-copy-btn" aria-live="polite" @click="copyText(configJson, 'cfg')">
          <ChatCheckmarkSvg v-if="cfgCopied" class="mcp-copy-check" aria-hidden="true" />
          {{ cfgCopied ? t("chat.mcp.copiedConfig") : copyFailed === "cfg" ? t("chat.mcp.copyFailed") : t("chat.mcp.copyConfig") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getContext } from "@/services/Context";
import ChatCheckmarkSvg from "@/assets/images/chat-checkmark.svg";
import { getMcpManagerStatus, mcpRelease, runMcpManagerOperation, verifyBundledMcpRelease, type McpManagerStatus } from "@/services/chat/mcpManagerClient";
import {
  hasMcpBridgeCopyHintShown,
  isMcpBridgeEnabled,
  markMcpBridgeCopyHintShown,
  setMcpBridgeEnabled,
} from "@/services/chat/mcpBridgePrefs";
import { isMcpBridgeConnected, DOMA_MCP_BRIDGE_PORT } from "@/services/chat/mcpBridgeClient";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "bridge-enabled-change", enabled: boolean): void;
  (e: "bridge-ensure"): void;
}>();

const { t } = useI18n();

const extensionVersion = getContext().browser.runtime.getManifest().version as string;
const extensionId = getContext().browser.runtime.id as string;
const supportsNativeManager = getContext().browser.runtime.getURL("").startsWith("chrome-extension://");
const isWindows = navigator.platform.toLowerCase().startsWith("win");
const windowsInstallCommand = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$picker = New-Object System.Windows.Forms.OpenFileDialog",
  "$picker.Title = 'Select mcp-bridge/install-doma-mcp.ps1 from the local fork'",
  "$picker.Filter = 'PowerShell scripts (*.ps1)|*.ps1'",
  "$picker.CheckFileExists = $true",
  "try {",
  "  if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
  "    if ([IO.Path]::GetFileName($picker.FileName) -ne 'install-doma-mcp.ps1') { throw 'Select install-doma-mcp.ps1' }",
  `    & $picker.FileName -ExtensionId '${extensionId}'`,
  "  }",
  "} finally { $picker.Dispose() }",
].join("\n");
const installCommand = !supportsNativeManager
  ? "bash ./install-doma-mcp.sh"
  : isWindows
  ? windowsInstallCommand
  : `bash ./install-doma-mcp.sh '${extensionId}'`;

const bridgeEnabled = ref(false);
const bridgeConnected = ref(false);
const agentCount = ref(0);
const toggleBusy = ref(false);
const cmdCopied = ref(false);
const cfgCopied = ref(false);
const codexCopied = ref(false);
const copyFailed = ref<"cmd" | "cfg" | "codex" | null>(null);
const managerStatus = ref<McpManagerStatus | null>(null);
const managerError = ref("");
const managerBusy = ref(false);
const uninstallHelpVisible = ref(false);
const releaseReady = ref<boolean | null>(null);
let lastReleaseCheck = 0;
const installedVersionNewer = computed(() => {
  const installed = managerStatus.value?.installedVersion;
  if (!installed) return false;
  return installed.localeCompare(mcpRelease.version, undefined, { numeric: true }) > 0;
});
const managerCompatible = computed(() => {
  const version = managerStatus.value?.managerVersion;
  return typeof version === "string" && version.localeCompare(mcpRelease.minManagerVersion, undefined, { numeric: true }) >= 0;
});
const versionCompatible = computed(() => {
  const state = managerStatus.value;
  return !!state?.installed && state.installedVersion === mcpRelease.version &&
    (!state.daemonRunning || state.bridgeProtocolVersion === mcpRelease.bridgeProtocolVersion);
});
const pythonCommand = computed(() => managerStatus.value?.pythonCommand || "python3");
const scriptPath = computed(() => managerStatus.value?.scriptPath || "$HOME/.doma/mcp/doma_mcp_stdio.py");
const configJson = computed(() => JSON.stringify({
  mcpServers: { DomA: { command: pythonCommand.value, args: [scriptPath.value] } },
}, null, 2));
const codexConfig = computed(() =>
  `[mcp_servers.DomA]\ncommand = ${JSON.stringify(pythonCommand.value)}\nargs = [${JSON.stringify(scriptPath.value)}]\ntool_timeout_sec = 120`,
);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let lastEnsureAt = 0;
const ENSURE_COOLDOWN_MS = 12_000;

async function loadEnabled() {
  try {
    bridgeEnabled.value = await isMcpBridgeEnabled();
    emit("bridge-enabled-change", bridgeEnabled.value);
  } catch (e) {
    console.warn("[McpPanel] getEnabled failed", e);
    bridgeEnabled.value = false;
    emit("bridge-enabled-change", false);
  }
}

async function toggleBridgeEnabled() {
  if (toggleBusy.value) return;
  toggleBusy.value = true;
  const next = !bridgeEnabled.value;
  try {
    await setMcpBridgeEnabled(next);
    bridgeEnabled.value = next;
    emit("bridge-enabled-change", next);
    if (next) {
      void refreshHealth();
    } else {
      bridgeConnected.value = false;
      agentCount.value = 0;
    }
  } catch (e) {
    console.warn("[McpPanel] setEnabled failed", e);
  } finally {
    toggleBusy.value = false;
  }
}

function kickBridgeIfNeeded() {
  if (!bridgeEnabled.value) return;
  const now = Date.now();
  if (now - lastEnsureAt < ENSURE_COOLDOWN_MS) return;
  lastEnsureAt = now;
  emit("bridge-ensure");
}

async function refreshHealth() {
  if (!supportsNativeManager) {
    bridgeConnected.value = bridgeEnabled.value && isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT);
    agentCount.value = 0;
    if (bridgeEnabled.value && !bridgeConnected.value) kickBridgeIfNeeded();
    return;
  }
  void checkBundledRelease();
  try {
    const data = await getMcpManagerStatus();
    managerStatus.value = data;
    managerError.value = "";
    if (data.agentCount === 0) uninstallHelpVisible.value = false;
    bridgeConnected.value = bridgeEnabled.value && (data.bridgeConnected || isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT));
    agentCount.value = bridgeEnabled.value ? data.agentCount : 0;
    if (bridgeEnabled.value && !bridgeConnected.value) {
      kickBridgeIfNeeded();
    }
  } catch (error) {
    managerStatus.value = null;
    managerError.value = error instanceof Error ? error.message : String(error);
    bridgeConnected.value = bridgeEnabled.value && isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT);
    agentCount.value = 0;
    kickBridgeIfNeeded();
  }
}

async function refreshManager() {
  lastReleaseCheck = 0;
  await refreshHealth();
}

async function checkBundledRelease() {
  if (Date.now() - lastReleaseCheck < 60_000) return;
  lastReleaseCheck = Date.now();
  try {
    releaseReady.value = await verifyBundledMcpRelease();
  } catch {
    releaseReady.value = false;
  }
}

async function runManagerAction(operation: "upgrade" | "start" | "stop" | "uninstall") {
  if (managerBusy.value) return;
  if (operation === "uninstall" && (managerStatus.value?.agentCount ?? 0) > 0) {
    uninstallHelpVisible.value = true;
    return;
  }
  const confirmation = operation === "upgrade" ? "upgradeConfirm" : operation === "uninstall" ? "uninstallConfirm" : null;
  if (confirmation && !window.confirm(t(`chat.mcp.${confirmation}`))) return;
  managerBusy.value = true;
  managerError.value = "";
  try {
    await runMcpManagerOperation(operation);
    await refreshHealth();
    if (operation === "upgrade" || operation === "uninstall") {
      window.alert(t(operation === "upgrade" ? "chat.mcp.upgradeDone" : "chat.mcp.uninstallDone"));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (operation === "uninstall" && message.includes("desktop agents are still connected")) {
      await refreshHealth();
      uninstallHelpVisible.value = true;
    } else if ((operation === "stop" || operation === "upgrade") && message.includes("daemon is busy or too old for GUI stop")) {
      managerError.value = t("chat.mcp.stopBlocked");
    } else {
      managerError.value = message;
    }
  } finally {
    managerBusy.value = false;
  }
}

function startPolling() {
  stopPolling();
  void (async () => {
    await loadEnabled();
    void refreshHealth();
  })();
  pollTimer = setInterval(() => {
    if (!managerBusy.value) void refreshHealth();
  }, 15_000);
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function writeClipboard(text: string): Promise<void> {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    copied = document.execCommand("copy");
  } catch {
    // Some extension contexts reject the legacy copy path; try Clipboard API below.
  } finally {
    textarea.remove();
  }
  if (copied) return;
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
  await navigator.clipboard.writeText(text);
}

async function copyText(text: string, kind: "cmd" | "cfg" | "codex") {
  if (copyTimer) clearTimeout(copyTimer);
  cmdCopied.value = false;
  codexCopied.value = false;
  cfgCopied.value = false;
  copyFailed.value = null;
  try {
    await writeClipboard(text);
  } catch (e) {
    copyFailed.value = kind;
    console.warn("[McpPanel] copy failed", e);
    copyTimer = setTimeout(() => {
      copyFailed.value = null;
    }, 1600);
    return;
  }
  cmdCopied.value = kind === "cmd";
  codexCopied.value = kind === "codex";
  cfgCopied.value = kind === "cfg";
  copyTimer = setTimeout(() => {
    cmdCopied.value = false;
    cfgCopied.value = false;
    codexCopied.value = false;
  }, 1600);
  if (kind === "cmd" && !bridgeEnabled.value) {
    try {
      const shown = await hasMcpBridgeCopyHintShown();
      if (!shown) {
        window.alert(t("chat.mcp.enableBeforeInstallHint"));
        await markMcpBridgeCopyHintShown();
      }
    } catch (e) {
      console.warn("[McpPanel] copy hint failed", e);
    }
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
});

onUnmounted(() => {
  stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped lang="less">
.mcp-panel {
  padding: 10px 12px 14px;
  color: var(--stay-black);
}

.mcp-manager-card {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--stay-border, #333);
  border-radius: 10px;
  background: var(--stay-backgroundSecondary, transparent);
  font-size: 12px;

  .mcp-copy-btn {
    margin-top: 0;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.mcp-manager-heading,
.mcp-manager-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mcp-manager-heading {
  justify-content: space-between;
  margin-bottom: 7px;
}

.mcp-manager-line {
  margin: 3px 0;
  color: var(--stay-labelSecondary, #888);
  line-height: 1.4;
}

.mcp-manager-warning {
  color: var(--stay-error, #e74c3c);
}

.mcp-manager-actions {
  margin-top: 9px;
}

.mcp-manager-remove {
  color: var(--stay-error, #e74c3c);
  border: 1px solid color-mix(in srgb, var(--stay-error, #e74c3c) 55%, var(--stay-border));
}

.mcp-section-subtitle {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
}

.mcp-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--stay-labelSecondary, #888);
}

.mcp-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #333);
  background: var(--stay-backgroundSecondary, transparent);
}

.mcp-toggle-copy {
  flex: 1;
  min-width: 0;
}

.mcp-toggle-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.mcp-toggle-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--stay-labelSecondary, #888);
}

.mcp-switch {
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

.mcp-switch-knob {
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

  .mcp-switch.on & {
    transform: translateX(18px);
  }
}

.mcp-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}

.mcp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
  &.on {
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
  }
  &.off {
    background: #bbb;
    box-shadow: none;
  }
}

.mcp-status-agents {
  margin-left: auto;
  color: #16a34a;
  font-weight: 600;
}

.mcp-section {
  margin-top: 12px;
}

.mcp-section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.mcp-hint {
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--stay-labelSecondary, #888);
}

.mcp-code {
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

.mcp-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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

}

.mcp-copy-check {
  width: 11px;
  height: 11px;
}
</style>
