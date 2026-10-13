/** Browser context identity is independent of the bridge socket's lifetime. */
export type McpRuntimeContexts = {
  getContexts?: (filter: {
    contextTypes?: Array<"SIDE_PANEL">;
    documentUrls?: string[];
    contextIds?: string[];
  }) => Promise<unknown>;
};

export type McpExecutionContextState = "present" | "missing" | "unknown";

function isExactId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

function isContext(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ambiguous documents and unsupported APIs cannot establish this renderer's owner. */
export async function getMcpExecutionContextId(
  runtime: McpRuntimeContexts | null | undefined,
  exactDocumentUrl: unknown,
): Promise<string | undefined> {
  try {
    if (typeof runtime?.getContexts !== "function" || typeof exactDocumentUrl !== "string" ||
        !exactDocumentUrl || exactDocumentUrl.trim() !== exactDocumentUrl) return undefined;
    // Validate without normalizing: the filter and result must retain the exact URL.
    new URL(exactDocumentUrl);
    const contexts = await runtime.getContexts({ contextTypes: ["SIDE_PANEL"], documentUrls: [exactDocumentUrl] });
    if (!Array.isArray(contexts) || contexts.length !== 1) return undefined;
    const context = contexts[0];
    if (!isContext(context) || context.contextType !== "SIDE_PANEL" ||
        context.documentUrl !== exactDocumentUrl || !isExactId(context.contextId)) return undefined;
    return context.contextId;
  } catch {
    return undefined;
  }
}

/** Only a successful browser-context query with no matches proves owner loss. */
export async function getMcpExecutionContextState(
  runtime: McpRuntimeContexts | null | undefined,
  ownerContextId: unknown,
): Promise<McpExecutionContextState> {
  try {
    if (typeof runtime?.getContexts !== "function" || !isExactId(ownerContextId)) return "unknown";
    const contexts = await runtime.getContexts({ contextIds: [ownerContextId] });
    if (!Array.isArray(contexts)) return "unknown";
    if (contexts.length === 0) return "missing";
    if (contexts.length !== 1) return "unknown";
    const context = contexts[0];
    return isContext(context) && context.contextId === ownerContextId && context.contextType === "SIDE_PANEL"
      ? "present" : "unknown";
  } catch {
    return "unknown";
  }
}

/** The caller selects and rechecks the latest persisted turn before applying a decision. */
export function decideMcpExecutionRecovery(input: {
  status: unknown;
  requestId: unknown;
  ownerContextId: unknown;
  hasController: boolean | undefined;
  hasPendingTerminalResult: boolean | undefined;
  ownerContextState: McpExecutionContextState;
}): "preserve" | "unknown" | "interrupted" {
  if (input.hasController === true || input.hasPendingTerminalResult === true ||
      input.status === "done" || input.status === "error" || input.status === "needs_user_input") return "preserve";
  if (input.status !== "running") return "unknown";
  if (input.ownerContextState === "present") return "preserve";
  if (!isExactId(input.requestId) || !isExactId(input.ownerContextId) ||
      input.hasController !== false || input.hasPendingTerminalResult !== false) return "unknown";
  return input.ownerContextState === "missing" ? "interrupted" : "unknown";
}
