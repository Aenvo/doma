import { getContext } from "@/services/Context";

type BrowserToolRuntimeResponse = {
  success?: boolean;
  result?: unknown;
  error?: unknown;
};

function abortError(): Error {
  const error = new Error("Browser tool call aborted");
  error.name = "AbortError";
  return error;
}

function timeoutError(toolName: string, timeoutMs: number): Error {
  const error = new Error(
    `Tool ${toolName} timed out after ${Math.max(1, Math.round(timeoutMs / 1000))}s`,
  );
  error.name = "BrowserToolTimeoutError";
  return error;
}

/**
 * Run a local browser tool over one scoped runtime.sendMessage request/response.
 *
 * The older MCP transport broadcasts responses to every extension context. A side-panel
 * reload or service-worker lifecycle transition can therefore lose the response even
 * though the tool finished. This channel keeps the response attached to the originating
 * request and is already handled by service-worker.ts.
 */
export function callBrowserToolViaRuntime(
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(abortError());

  const effectiveTimeoutMs = Math.max(1, Math.floor(timeoutMs));

  return new Promise((resolve, reject) => {
    let settled = false;
    let responsePromise: Promise<BrowserToolRuntimeResponse>;

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (
      callback: () => void,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => {
      finish(() => reject(timeoutError(name, effectiveTimeoutMs)));
    }, effectiveTimeoutMs + 1_000);

    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      responsePromise = Promise.resolve(
        getContext().browser.runtime.sendMessage({
          origin: "sidepanel",
          operate: "chat/runBrowserTool",
          name,
          toolArgs: args,
        }) as Promise<BrowserToolRuntimeResponse>,
      );
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      return;
    }

    responsePromise.then(
      (response) => {
        finish(() => {
          if (!response || response.success !== true) {
            const message =
              typeof response?.error === "string" && response.error.trim()
                ? response.error.trim()
                : `Tool ${name} failed without a result`;
            reject(new Error(message));
            return;
          }
          resolve(response.result);
        });
      },
      (error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      },
    );
  });
}
