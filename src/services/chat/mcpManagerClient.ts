import { getContext } from "@/services/Context";
import release from "../../../mcp-bridge/doma_mcp_release.json";
import bridgeAuthSource from "../../../mcp-bridge/bridge_auth.py?raw";
import stdioSource from "../../../mcp-bridge/doma_mcp_stdio.py?raw";
import daemonSource from "../../../mcp-bridge/doma_bridge_daemon.py?raw";

const HOST_NAME = "app.stayfork.doma_mcp_manager";

export const mcpRelease = release;
const bundledFiles = {
  "bridge_auth.py": bridgeAuthSource,
  "doma_mcp_stdio.py": stdioSource,
  "doma_bridge_daemon.py": daemonSource,
};

export async function verifyBundledMcpRelease(): Promise<boolean> {
  const names = Object.keys(bundledFiles) as Array<keyof typeof bundledFiles>;
  if (Object.keys(mcpRelease.sha256).length !== names.length) return false;
  for (const name of names) {
    const bytes = new TextEncoder().encode(bundledFiles[name]);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    if (hash !== mcpRelease.sha256[name]) return false;
  }
  return true;
}

export type McpManagerStatus = {
  ok: boolean;
  managerVersion: string;
  pythonCommand: string;
  scriptPath: string;
  installed: boolean;
  installedVersion: string | null;
  daemonRunning: boolean;
  daemonVersion: string | null;
  bridgeProtocolVersion: number | null;
  bridgeConnected: boolean;
  agentCount: number;
  controlPortOccupied: boolean;
};

function nativeRequest<T>(request: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const runtime = getContext().browser?.runtime;
  if (typeof runtime?.sendNativeMessage !== "function") {
    return Promise.reject(new Error("nativeMessaging is unavailable"));
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("MCP manager timed out"));
    }, timeoutMs);
    try {
      runtime.sendNativeMessage(HOST_NAME, request, (response: T | undefined) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        const error = runtime.lastError;
        if (error || !response) reject(new Error(error?.message || "MCP manager did not respond"));
        else resolve(response);
      });
    } catch (error) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

type ManagerReply = { ok: boolean; error?: string } & Record<string, unknown>;

export async function getMcpManagerStatus(): Promise<McpManagerStatus> {
  const response = await nativeRequest<McpManagerStatus & { error?: string }>({ operation: "status" });
  if (!response.ok) throw new Error(response.error || "MCP manager status failed");
  return response;
}

export async function runMcpManagerOperation(operation: "upgrade" | "start" | "stop" | "uninstall"): Promise<ManagerReply> {
  const request: Record<string, unknown> = { operation };
  if (operation === "upgrade") {
    if (!await verifyBundledMcpRelease()) throw new Error("Bundled MCP companion checksum mismatch");
    request.version = mcpRelease.version;
    request.sha256 = mcpRelease.sha256;
    request.files = bundledFiles;
  }
  const response = await nativeRequest<ManagerReply>(request, operation === "upgrade" ? 90_000 : 20_000);
  if (!response.ok) throw new Error(response.error || `MCP manager ${operation} failed`);
  return response;
}
