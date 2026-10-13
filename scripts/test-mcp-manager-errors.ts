import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileScript, compileTemplate, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import * as vue from "vue";
import { createI18n } from "vue-i18n";
import messages from "../src/config/locale/local.sidepanel.ts";
import { classifyMcpManagerError } from "../src/services/chat/mcpManagerErrors.ts";

// Exercise the actual card and refresh path without contacting a native host.
const source = readFileSync(new URL("../src/components/chat/McpProviderPanel.vue", import.meta.url), "utf8");
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const script = compileScript(descriptor, { id: "mcp-manager-regression" });
const template = compileTemplate({
  source: descriptor.template!.content,
  filename: "McpProviderPanel.vue",
  id: "mcp-manager-regression",
  compilerOptions: { bindingMetadata: script.bindings },
});
assert.deepEqual(template.errors, []);

function evaluate(code: string, imports: Record<string, unknown>): any {
  const result = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const exports = {};
  const require = (name: string) => {
    assert.ok(name in imports, `Unexpected component import: ${name}`);
    return imports[name];
  };
  new Function("require", "exports", result.outputText)(require, exports);
  return exports;
}

const extensionId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const release = JSON.parse(readFileSync(new URL("../mcp-bridge/doma_mcp_release.json", import.meta.url), "utf8"));
const operations: string[] = [];
let statusReply: () => Promise<unknown>;
let operationError: Error | null = null;
let operationPending: Promise<void> | null = null;
let localBridgeConnected = false;
let statusRequestCount = 0;
let language: "zh" | "en" = "zh";
let clipboardText = "";
let copyTarget: { value: string };
const i18n = createI18n({ legacy: false, locale: language, messages });
const savedGlobals = new Map(["navigator", "document", "window"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
for (const [name, value] of Object.entries({
  navigator: { platform: "Win32" },
  document: {
    createElement: () => (copyTarget = { value: "", setAttribute() {}, style: {}, focus() {}, select() {}, remove() {} } as any),
    body: { appendChild() {} },
    execCommand: () => { clipboardText = copyTarget.value; return true; },
  },
  window: { setTimeout, clearTimeout, alert() {}, confirm: () => true },
})) Object.defineProperty(globalThis, name, { configurable: true, value });

const component = evaluate(script.content, {
  vue: { ...vue, watch() {}, onMounted() {}, onUnmounted() {} },
  "vue-i18n": { useI18n: () => i18n.global },
  "@/services/Context": { getContext: () => ({ browser: { runtime: {
    id: extensionId, getManifest: () => ({ version: "0.0.18" }), getURL: () => `chrome-extension://${extensionId}/`,
  } } }) },
  "@/assets/images/chat-checkmark.svg": { render: () => null },
  "@/services/chat/mcpManagerClient": {
    mcpRelease: release,
    getMcpManagerStatus: () => { statusRequestCount++; return statusReply(); },
    verifyBundledMcpRelease: async () => true,
    runMcpManagerOperation: async (operation: string) => {
      operations.push(operation);
      if (operationError) throw operationError;
      if (operationPending) await operationPending;
      return { ok: true };
    },
  },
  "@/services/chat/mcpManagerErrors": { classifyMcpManagerError },
  "@/services/chat/mcpBridgePrefs": {
    hasMcpBridgeCopyHintShown: async () => true,
    isMcpBridgeEnabled: async () => false,
    markMcpBridgeCopyHintShown: async () => {},
    setMcpBridgeEnabled: async () => {},
  },
  "@/services/chat/mcpBridgeClient": { isMcpBridgeConnected: () => localBridgeConnected, DOMA_MCP_BRIDGE_PORT: 3847 },
}).default;
const { render } = evaluate(template.code, { vue });
const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(`chat.mcp.${key}`, { id: extensionId, ...values });
async function markup(state: any): Promise<string> {
  const setup = vue.proxyRefs(state);
  return renderToString(vue.createSSRApp({ render: () => render({}, [], { open: false }, setup, {}, {}) }));
}
function hasButton(html: string, label: string): boolean {
  return Array.from(html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g))
    .some((match) => match[1].replace(/<[^>]*>/g, "").trim() === label);
}
function disabledButton(html: string, label: string): boolean {
  return Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g))
    .some((match) => /\bdisabled\b/.test(match[1]) && match[2].replace(/<[^>]*>/g, "").trim() === label);
}
function containsText(html: string, text: string): boolean {
  const escaped = text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
  return html.includes(escaped);
}
const healthyStatus = {
  ok: true, managerVersion: release.minManagerVersion,
  pythonCommand: "python", scriptPath: "/synthetic/mcp/doma_mcp_stdio.py",
  installed: true, installedVersion: release.version,
  daemonRunning: false, daemonVersion: null, bridgeProtocolVersion: null,
  bridgeConnected: false, agentCount: 0, controlPortOccupied: false,
};

try {
  for (language of ["zh", "en"] as const) {
    i18n.global.locale.value = language;
    const state = component.setup({ open: false }, { expose() {}, emit() {} });
    let html = await markup(state);
    assert.ok(html.includes(t("managerChecking")), "Initial state must show checking, not missing installation");
    assert.ok(hasButton(html, t("copyManagerSetup")), "Setup must be reachable without a native-host connection");
    assert.equal(hasButton(html, t("installCompanion")), false);
    assert.ok(html.includes(t("agentsUnknown")), "Unchecked client count must not be reported as zero");
    assert.match(html, /class="mcp-status-agents disconnected"/, "Unknown client counts must not use the success state");

    for (const [raw, key] of [
      ["Access to the specified native messaging host is forbidden.", "managerForbidden"],
      ["Specified native messaging host not found.", "managerMissing"],
      ["Native messaging host app.stayfork.doma_mcp_manager is not registered.", "managerMissing"],
      ["MCP manager timed out", "managerTimeout"],
      ["Native host has exited.", "managerCheckFailed"],
      ["nativeMessaging is unavailable", "managerCheckFailed"],
    ]) {
      statusReply = async () => { throw new Error(raw); };
      await state.refreshManager();
      html = await markup(state);
      assert.ok(html.includes(t(key)), `${language}: wrong recovery message for ${raw}`);
      assert.ok(hasButton(html, t("copyManagerSetup")));
      assert.equal(hasButton(html, t("installCompanion")), false);
      const details = html.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/);
      assert.ok(details, "Original failure must remain available in technical details");
      assert.doesNotMatch(details[1], /\bopen\b/, "Technical details must start collapsed");
      assert.ok(details[2].includes(raw));
      assert.equal(html.replace(details[0], "").includes(raw), false, "Raw failures must not replace recovery guidance");
    }

    await state.copyText(state.installCommand, "cmd");
    assert.ok(clipboardText.includes(`-ExtensionId '${extensionId}'`), "Repair must register this instance's extension ID");
    clearTimeout(state.copyTimer);
    state.cmdCopied.value = false;
    assert.equal(operations.length, 0, "Checking and copying must not install or change native authorization");

    let finishStatus!: (status: unknown) => void;
    statusReply = () => new Promise((resolve) => { finishStatus = resolve; });
    const refreshing = state.refreshManager();
    html = await markup(state);
    assert.ok(html.includes(t("managerChecking")), "Retry must show its pending state");
    finishStatus(healthyStatus);
    await refreshing;
    html = await markup(state);
    assert.equal(hasButton(html, t("copyManagerSetup")), false);
    assert.equal(html.includes("<details"), false);
    assert.ok(hasButton(html, t("startDaemon")), "Recovered registrations must restore service controls");
    assert.ok(hasButton(html, t("uninstallCompanion")));
    assert.ok(html.includes(t("nextStepStart")), "Repaired current installations should proceed to starting the service");
    assert.ok(html.includes(t("agentsConnected", { count: 0 })), "Zero clients must remain visible even with the bridge disabled");
    assert.match(html, /class="mcp-status-agents disconnected"/, "Zero client counts must not use the success state");
    assert.ok(html.includes(t("noAgentsHint")));

    statusReply = async () => ({ ...healthyStatus, installed: false, installedVersion: null });
    await state.refreshManager();
    html = await markup(state);
    assert.ok(hasButton(html, t("installCompanion")));
    assert.ok(html.includes(t("nextStepInstall")));
    statusReply = async () => ({ ...healthyStatus, installedVersion: "0.0.1", daemonRunning: true, bridgeProtocolVersion: release.bridgeProtocolVersion });
    await state.refreshManager();
    html = await markup(state);
    assert.ok(hasButton(html, t("upgrade")));
    assert.ok(hasButton(html, t("stopDaemon")));
    assert.ok(html.includes(t("nextStepUpdate")));
    statusReply = async () => ({ ...healthyStatus, daemonRunning: true, bridgeProtocolVersion: release.bridgeProtocolVersion });
    await state.refreshManager();
    html = await markup(state);
    assert.ok(containsText(html, t("nextStepRunning")));
    assert.equal(hasButton(html, t("installCompanion")), false);
    statusReply = async () => ({ ...healthyStatus, managerVersion: "0.0.1" });
    await state.refreshManager();
    html = await markup(state);
    assert.ok(html.includes(t("managerOutdated")));
    assert.ok(hasButton(html, t("copyManagerSetup")), "Older managers must have an immediate repair entry point");
  }

  const state = component.setup({ open: false }, { expose() {}, emit() {} });
  statusReply = async () => healthyStatus;
  await state.refreshManager();
  operationError = new Error("The daemon control port is occupied.");
  await state.runManagerAction("start");
  const html = await markup(state);
  assert.ok(html.includes(t("managerOperationFailed")));
  assert.ok(html.includes(operationError.message));
  assert.deepEqual(operations, ["start"]);
  await state.refreshHealth();
  assert.equal(state.managerTechnicalError.value, operationError.message, "Health polling must retain failed-operation details");
  statusReply = async () => { throw new Error("MCP manager timed out"); };
  await state.refreshHealth();
  const concurrentErrors = await markup(state);
  assert.ok(concurrentErrors.includes(operationError.message));
  assert.ok(concurrentErrors.includes("MCP manager timed out"), "Current status and preceding operation failures must both remain inspectable");
  statusReply = async () => healthyStatus;
  await state.refreshManager();
  assert.equal(state.managerTechnicalError.value, "", "Explicit refresh should clear preceding operation failures");

  let finishPoll!: (status: unknown) => void;
  statusReply = () => new Promise((resolve) => { finishPoll = resolve; });
  const poll = state.refreshHealth();
  assert.ok(disabledButton(await markup(state), t("startDaemon")), "Management must be disabled while status is in flight");
  const previousOperations = operations.length;
  await state.runManagerAction("start");
  assert.equal(operations.length, previousOperations, "The operation entry point must also enforce the status guard");
  finishPoll(healthyStatus);
  await poll;

  operationError = null;
  let finishOperation!: () => void;
  operationPending = new Promise((resolve) => { finishOperation = resolve; });
  const statusReadsBeforeOperation = statusRequestCount;
  const starting = state.runManagerAction("start");
  await state.refreshHealth();
  assert.equal(statusRequestCount, statusReadsBeforeOperation, "Health requests must wait until the operation has finished");
  statusReply = async () => ({ ...healthyStatus, daemonRunning: true, bridgeProtocolVersion: release.bridgeProtocolVersion });
  finishOperation();
  await starting;
  operationPending = null;
  assert.equal(statusRequestCount, statusReadsBeforeOperation + 1, "Successful operations must request a new status snapshot");
  assert.equal(state.managerStatus.value.daemonRunning, true);

  statusReply = async () => healthyStatus;
  await state.refreshManager();
  operationError = new Error("The service failed after partially changing the companion.");
  let finishFailureStatus!: (status: unknown) => void;
  statusReply = () => new Promise((resolve) => { finishFailureStatus = resolve; });
  const statusReadsBeforeFailure = statusRequestCount;
  const failedOperation = state.runManagerAction("upgrade");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(statusRequestCount, statusReadsBeforeFailure + 1, "Failed operations must also request a fresh status snapshot");
  assert.equal(state.managerBusy.value, true, "Management must remain busy while the post-failure status is pending");
  assert.ok(disabledButton(await markup(state), t("startDaemon")), "Old controls must stay disabled until the actual post-failure state is known");
  finishFailureStatus({ ...healthyStatus, installedVersion: "0.0.1", daemonRunning: true, bridgeProtocolVersion: release.bridgeProtocolVersion });
  await failedOperation;
  assert.equal(state.managerBusy.value, false);
  assert.equal(state.managerStatus.value.installedVersion, "0.0.1");
  assert.equal(state.managerStatus.value.daemonRunning, true);
  const afterPartialFailure = await markup(state);
  assert.equal(hasButton(afterPartialFailure, t("startDaemon")), false, "Stale start controls must not be restored after a partial failure");
  assert.ok(hasButton(afterPartialFailure, t("stopDaemon")));
  assert.ok(hasButton(afterPartialFailure, t("upgrade")));
  assert.ok(afterPartialFailure.includes(t("managerOperationFailed")));
  assert.ok(afterPartialFailure.includes(operationError.message), "Post-failure refresh must preserve the operation's technical details");

  const emitted: string[] = [];
  const sidebar = component.setup({ open: false }, { expose() {}, emit: (event: string) => emitted.push(event) });
  sidebar.bridgeEnabled.value = true;
  statusReply = async () => ({ ...healthyStatus, bridgeConnected: true, agentCount: 2 });
  await sidebar.refreshManager();
  assert.equal(sidebar.bridgeConnected.value, false, "Another sidebar's connection must not mark this socket connected");
  assert.ok(emitted.includes("bridge-ensure"), "The disconnected current sidebar must still request reconnection");
  assert.ok((await markup(sidebar)).includes(t("agentsConnected", { count: 2 })));
  assert.match(await markup(sidebar), /class="mcp-status-agents"/, "Positive client counts should retain the connected style");
  localBridgeConnected = true;
  statusReply = async () => ({ ...healthyStatus, bridgeConnected: false, agentCount: 2 });
  await sidebar.refreshManager();
  assert.equal(sidebar.bridgeConnected.value, true, "The current socket is the connection indicator's source");
  await sidebar.toggleBridgeEnabled();
  assert.equal(sidebar.agentCount.value, 2, "Disabling this sidebar must not hide globally connected MCP clients");
  assert.ok((await markup(sidebar)).includes(t("agentsConnected", { count: 2 })));
  console.log("MCP manager card: registration recovery, next-step guidance, current socket, client counts, operation serialization, and retained errors passed (zh/en)");
} finally {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
