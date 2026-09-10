import { reactive } from "vue";

export type BrowserPlanStepStatus = "pending" | "doing" | "done" | "failed";

export type BrowserPlanStep = {
  id: string;
  title: string;
  intent?: string;
  successCriteria?: string;
  status: BrowserPlanStepStatus;
};

type BrowserPlanState = {
  planId?: string;
  planName?: string;
  steps: BrowserPlanStep[];
};

type BrowserPlanStepsState = {
  byConversation: Record<string, BrowserPlanState>;
};

const state = reactive<BrowserPlanStepsState>({
  byConversation: {},
});

export function getBrowserPlanSteps(conversationId: string): BrowserPlanStep[] {
  const cid = conversationId.trim();
  if (!cid) return [];
  return state.byConversation[cid]?.steps ?? [];
}

export function getBrowserPlanId(conversationId: string): string | undefined {
  const cid = conversationId.trim();
  if (!cid) return undefined;
  return state.byConversation[cid]?.planId;
}

export function getBrowserPlanName(conversationId: string): string | undefined {
  const cid = conversationId.trim();
  if (!cid) return undefined;
  return state.byConversation[cid]?.planName;
}

export function setBrowserPlanSteps(
  conversationId: string,
  steps: BrowserPlanStep[],
  meta?: { planName?: string; planId?: string },
): void {
  const cid = conversationId.trim();
  if (!cid) return;
  const prev = state.byConversation[cid];
  const nextPlanName = meta?.planName?.trim() || prev?.planName;
  const nextPlanId = meta?.planId?.trim() || prev?.planId;
  state.byConversation[cid] = {
    ...(nextPlanId ? { planId: nextPlanId } : {}),
    ...(nextPlanName ? { planName: nextPlanName } : {}),
    steps: ensureSingleDoing(steps),
  };
}

export function setBrowserPlanId(conversationId: string, planId: string): void {
  const cid = conversationId.trim();
  const id = planId.trim();
  if (!cid || !id) return;
  const prev = state.byConversation[cid];
  state.byConversation[cid] = {
    ...(prev?.planName ? { planName: prev.planName } : {}),
    ...(prev?.steps ? { steps: prev.steps } : { steps: [] }),
    planId: id,
  };
}

export function setBrowserPlanName(conversationId: string, planName: string): void {
  const cid = conversationId.trim();
  const name = planName.trim();
  if (!cid || !name) return;
  const prev = state.byConversation[cid];
  state.byConversation[cid] = {
    ...(prev?.planId ? { planId: prev.planId } : {}),
    ...(prev?.steps ? { steps: prev.steps } : { steps: [] }),
    planName: name,
  };
}

export function clearBrowserPlanSteps(conversationId: string): void {
  const cid = conversationId.trim();
  if (!cid) return;
  delete state.byConversation[cid];
}

/** 确保有且仅有一个 doing：优先保留已有 doing，否则将第一个 pending 标为 doing */
function ensureSingleDoing(steps: BrowserPlanStep[]): BrowserPlanStep[] {
  if (!steps.length) return steps;

  const doingIdx = steps.findIndex((s) => s.status === "doing");
  if (doingIdx >= 0) {
    return steps.map((s, i) =>
      i !== doingIdx && s.status === "doing" ? { ...s, status: "pending" as const } : s,
    );
  }

  const firstPendingIdx = steps.findIndex((s) => s.status === "pending");
  if (firstPendingIdx < 0) return steps;

  return steps.map((s, i) =>
    i === firstPendingIdx ? { ...s, status: "doing" as const } : s,
  );
}

/** 根据 step.id 更新状态，用于步骤条 UI 刷新；done 时自动将下一个 pending 标为 doing */
export function updateBrowserPlanStepStatus(
  conversationId: string,
  stepId: string,
  status: BrowserPlanStepStatus,
): boolean {
  const cid = conversationId.trim();
  const id = stepId.trim();
  if (!cid || !id) return false;

  const plan = state.byConversation[cid];
  const steps = plan?.steps;
  if (!steps?.length) return false;

  const idx = steps.findIndex((s) => s.id === id);
  if (idx < 0) return false;

  let nextSteps = steps.map((s) => {
    if (s.id === id) return { ...s, status };
    if (status === "doing" && s.status === "doing") return { ...s, status: "pending" as const };
    return s;
  });

  if (status === "done") {
    const doneIdx = nextSteps.findIndex((s) => s.id === id);
    for (let j = doneIdx + 1; j < nextSteps.length; j++) {
      if (nextSteps[j].status === "pending") {
        nextSteps = nextSteps.map((s, i) =>
          i === j ? { ...s, status: "doing" as const } : s.status === "doing" ? { ...s, status: "pending" as const } : s,
        );
        break;
      }
    }
  }

  state.byConversation[cid] = {
    ...(plan.planId ? { planId: plan.planId } : {}),
    ...(plan.planName ? { planName: plan.planName } : {}),
    steps: nextSteps,
  };
  return true;
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** 将模型/browser_plan 入参规范为带 pending 状态的步骤列表 */
export function normalizePlanSteps(rawList: unknown): BrowserPlanStep[] {
  if (!Array.isArray(rawList)) return [];

  const out: BrowserPlanStep[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;

    const title = pickString(o, "title", "description", "intent");
    if (!title) continue;

    const id = pickString(o, "id") || `step-${i + 1}`;
    const intent = pickString(o, "intent", "description", "action") || undefined;
    const successCriteria = pickString(o, "successCriteria") || undefined;

    out.push({
      id,
      title,
      ...(intent ? { intent } : {}),
      ...(successCriteria ? { successCriteria } : {}),
      status: "pending",
    });
  }
  return out;
}

export function parseBrowserPlanFromArguments(argumentsJson: string | undefined): {
  planId?: string;
  planName?: string;
  steps: BrowserPlanStep[];
} {
  if (!argumentsJson?.trim()) return { steps: [] };
  try {
    const args = JSON.parse(argumentsJson) as {
      planId?: unknown;
      planName?: unknown;
      stepList?: unknown;
    };
    const planId = typeof args.planId === "string" ? args.planId.trim() : undefined;
    const planName = typeof args.planName === "string" ? args.planName.trim() : undefined;
    return {
      ...(planId ? { planId } : {}),
      ...(planName ? { planName } : {}),
      steps: normalizePlanSteps(args.stepList),
    };
  } catch {
    return { steps: [] };
  }
}

/** @deprecated 使用 parseBrowserPlanFromArguments */
export function parseBrowserPlanToolArguments(argumentsJson: string | undefined): BrowserPlanStep[] {
  return parseBrowserPlanFromArguments(argumentsJson).steps;
}

export function initBrowserPlanFromToolCall(
  conversationId: string,
  toolCall: { function?: { arguments?: string } },
): BrowserPlanStep[] {
  const { planId, planName, steps } = parseBrowserPlanFromArguments(toolCall.function?.arguments);
  if (planId || planName || steps.length) {
    setBrowserPlanSteps(conversationId, steps, {
      ...(planId ? { planId } : {}),
      ...(planName ? { planName } : {}),
    });
  }
  return steps;
}

/** 解析 browser_step_done 的 arguments JSON 并更新步骤状态 */
export function applyBrowserStepDoneFromToolCall(
  conversationId: string,
  argumentsJson: string | undefined,
): boolean {
  if (!argumentsJson?.trim()) return false;
  try {
    const args = JSON.parse(argumentsJson) as {
      planId?: unknown;
      stepId?: unknown;
      id?: unknown;
      success?: unknown;
    };
    const planId = typeof args.planId === "string" ? args.planId.trim() : "";
    const stepId =
      (typeof args.stepId === "string" ? args.stepId.trim() : "")
      || (typeof args.id === "string" ? args.id.trim() : "");
    if (!planId || !stepId || typeof args.success !== "boolean") return false;

    const activePlanId = getBrowserPlanId(conversationId);
    if (activePlanId && activePlanId !== planId) return false;

    return updateBrowserPlanStepStatus(conversationId, stepId, args.success ? "done" : "failed");
  } catch {
    return false;
  }
}
