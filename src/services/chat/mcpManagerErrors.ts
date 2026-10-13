export type McpManagerFailure = {
  kind: "forbidden" | "missing" | "timeout" | "failed";
  message: string;
};

export function classifyMcpManagerError(error: unknown): McpManagerFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/access to the specified native messaging host is forbidden/i.test(message)) {
    return { kind: "forbidden", message };
  }
  if (/specified native messaging host not found|native messaging host\b.*\b(?:not found|not registered)/i.test(message)) {
    return { kind: "missing", message };
  }
  if (/timed out|timeout/i.test(message)) {
    return { kind: "timeout", message };
  }
  return { kind: "failed", message };
}
