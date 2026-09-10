/** DomA CLI Runner (local HTTP on :3848) — health + reveal */

export const CLI_RUNNER_HOST = "127.0.0.1";
export const CLI_RUNNER_PORT = 3848;
export const CLI_RUNNER_BASE = `http://${CLI_RUNNER_HOST}:${CLI_RUNNER_PORT}`;
export const CLI_RUNNER_HEALTH_URL = `${CLI_RUNNER_BASE}/v1/health`;
export const CLI_RUNNER_REVEAL_URL = `${CLI_RUNNER_BASE}/v1/reveal`;
export const CLI_RUNNER_EXEC_URL = `${CLI_RUNNER_BASE}/v1/exec`;
export const CLI_RUNNER_SHELL_URL = `${CLI_RUNNER_BASE}/v1/shell`;

export const CLI_RUNNER_INSTALL_SH = "https://res.stayfork.app/d/install-doma-cli-runner.sh";
export const CLI_RUNNER_INSTALL_COMMAND = `curl -fsSL ${CLI_RUNNER_INSTALL_SH} | bash`;

/** ~/bin is installed + added to PATH in shell rc; full path works in the same terminal after curl|bash. */
export const CLI_RUNNER_BIN = "~/bin/doma-cli-runner";
export const CLI_RUNNER_START_COMMAND = `${CLI_RUNNER_BIN} start -d`;
export const CLI_RUNNER_STOP_COMMAND = `${CLI_RUNNER_BIN} stop`;
export const CLI_RUNNER_STATUS_COMMAND = `${CLI_RUNNER_BIN} status`;

export type CliRunnerCapability = {
  id: string;
  title?: string;
  description?: string;
  method?: string;
  path?: string;
};

export type CliRunnerHealth = {
  ok: boolean;
  running: boolean;
  version?: string;
  capabilities?: CliRunnerCapability[];
};

export async function fetchCliRunnerHealth(
  timeoutMs = 1500,
): Promise<CliRunnerHealth> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CLI_RUNNER_HEALTH_URL, {
      method: "GET",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ok: false, running: false };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      running?: boolean;
      version?: string;
      capabilities?: CliRunnerCapability[];
    };
    const running = data.ok === true || data.running === true;
    return {
      ok: running,
      running,
      version: typeof data.version === "string" ? data.version : undefined,
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    };
  } catch {
    return { ok: false, running: false };
  } finally {
    clearTimeout(timer);
  }
}

export type RevealResult =
  | { ok: true; path: string }
  | { ok: false; error: string; detail?: string };

/** Reveal absolute path in Finder / Explorer / file manager via CLI Runner. */
export async function revealPathInFileManager(
  absolutePath: string,
  timeoutMs = 8000,
): Promise<RevealResult> {
  const path = absolutePath.trim();
  if (!path) {
    return { ok: false, error: "path_required" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CLI_RUNNER_REVEAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      path?: string;
      error?: string;
      detail?: string;
    };
    if (!res.ok || data.ok !== true) {
      return {
        ok: false,
        error: data.error || `http_${res.status}`,
        detail: data.detail,
      };
    }
    return { ok: true, path: data.path || path };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: "runner_offline" };
  } finally {
    clearTimeout(timer);
  }
}

export type CliExecResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  command?: string;
  args?: string;
  shell?: string;
  resolved?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

/** Catalog CLI: PATH binary + argv (no shell). */
export async function execCliCommand(
  command: string,
  args = "",
  timeoutMs = 130_000,
): Promise<CliExecResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CLI_RUNNER_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as CliExecResult;
    if (res.status === 404) {
      return {
        ok: false,
        error: "exec_not_supported",
        detail: "Upgrade CLI Runner (reinstall doma_cli_runner.py)",
      };
    }
    return {
      ok: data.ok === true,
      error: data.error,
      detail: data.detail,
      command: data.command || command,
      args: data.args ?? args,
      resolved: data.resolved,
      exitCode: data.exitCode,
      stdout: typeof data.stdout === "string" ? data.stdout : "",
      stderr: typeof data.stderr === "string" ? data.stderr : "",
    };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "runner_offline" };
  } finally {
    clearTimeout(timer);
  }
}

/** Freeform shell command line (bash/sh/cmd). */
export async function runCliShell(
  command: string,
  timeoutSec = 120,
  timeoutMs = 130_000,
): Promise<CliExecResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CLI_RUNNER_SHELL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeoutSec }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as CliExecResult;
    if (res.status === 404) {
      return {
        ok: false,
        error: "shell_not_supported",
        detail: "Upgrade CLI Runner (reinstall doma_cli_runner.py)",
      };
    }
    return {
      ok: data.ok === true,
      error: data.error,
      detail: data.detail,
      command: data.command || command,
      shell: data.shell,
      exitCode: data.exitCode,
      stdout: typeof data.stdout === "string" ? data.stdout : "",
      stderr: typeof data.stderr === "string" ? data.stderr : "",
    };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "runner_offline" };
  } finally {
    clearTimeout(timer);
  }
}

/** Join workspace absolute root + relative segments (POSIX-style). */
export function joinWorkspaceAbsPath(
  rootAbs: string,
  relativeParts: string[],
): string {
  const root = rootAbs.replace(/[/\\]+$/, "");
  const parts = relativeParts
    .map((p) => p.trim())
    .filter((p) => p && p !== "." && p !== "..");
  if (!parts.length) return root;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root, ...parts].join(sep);
}
