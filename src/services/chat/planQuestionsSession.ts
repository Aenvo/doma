import { reactive } from "vue";

export type PlanQuestionOption = {
  id: string;
  label: string;
  value: string;
};

export type PlanQuestionItem = {
  id: string;
  question: string;
  optionsList: PlanQuestionOption[];
};

export type PlanQuestionSelection =
  | { kind: "option"; optionId: string; label: string; value: string }
  | { kind: "custom"; label: string; value: string };

export type PlanQuestionsUserResult =
  | { skipped: true }
  | {
      skipped: false;
      answers: Array<{
        questionId: string;
        question: string;
        selection: PlanQuestionSelection;
      }>;
    };

type PendingPlanQuestions = {
  requestId: string;
  conversationId: string;
  questionList: PlanQuestionItem[];
  resolve: (result: PlanQuestionsUserResult) => void;
  reject: (error: Error) => void;
};

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 从 option-1a / option-1b 等 id 末尾解析 A/B/C */
export function parseOptionLabelFromId(optId: string, index: number): string {
  const id = optId.trim();
  const suffixMatch = id.match(/(?:^option-?\d*|\d)([a-z])$/i) ?? id.match(/([a-z])$/i);
  if (suffixMatch?.[1]) return suffixMatch[1].toUpperCase();
  return OPTION_LABELS[index] ?? String(index + 1);
}

export function getCustomOptionLabel(optionCount: number): string {
  return OPTION_LABELS[optionCount] ?? String(optionCount + 1);
}

function compareOptionLabels(a: string, b: string): number {
  const ai = OPTION_LABELS.indexOf(a);
  const bi = OPTION_LABELS.indexOf(b);
  if (ai >= 0 && bi >= 0) return ai - bi;
  if (ai >= 0) return -1;
  if (bi >= 0) return 1;
  return a.localeCompare(b);
}

export function normalizePlanQuestionList(rawList: unknown): PlanQuestionItem[] {
  if (!Array.isArray(rawList)) return [];

  const out: PlanQuestionItem[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question.trim() : "";
    if (!question) continue;

    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `question-${i + 1}`;
    const optionsList: PlanQuestionOption[] = [];
    if (Array.isArray(o.optionsList)) {
      for (let j = 0; j < o.optionsList.length; j++) {
        const optRaw = o.optionsList[j];
        if (!optRaw || typeof optRaw !== "object" || Array.isArray(optRaw)) continue;
        const opt = optRaw as Record<string, unknown>;
        const value = typeof opt.value === "string" ? opt.value.trim() : "";
        if (!value) continue;
        const optId = typeof opt.id === "string" && opt.id.trim() ? opt.id.trim() : `option-${i + 1}${OPTION_LABELS[j]?.toLowerCase() ?? j + 1}`;
        const labelRaw = typeof opt.label === "string" ? opt.label.trim() : "";
        const parsedLabel = parseOptionLabelFromId(optId, j);
        const label =
          labelRaw && labelRaw.length <= 2 && /^[A-Za-z]$/.test(labelRaw)
            ? labelRaw.toUpperCase()
            : parsedLabel;
        optionsList.push({ id: optId, label, value });
      }
      optionsList.sort((a, b) => compareOptionLabels(a.label, b.label));
    }

    out.push({ id, question, optionsList });
  }
  return out;
}

export function formatPlanQuestionsContent(
  answers: Extract<PlanQuestionsUserResult, { skipped: false }>["answers"],
): string {
  return answers
    .map((a) => {
      if (a.selection.kind === "option") {
        return `[${a.questionId}] ${a.question}: ${a.selection.label}. ${a.selection.value}`;
      }
      return `[${a.questionId}] ${a.question}: ${a.selection.label}. ${a.selection.value}`;
    })
    .join("\n");
}

let pending: PendingPlanQuestions | null = null;

export const planQuestionsUi = reactive({
  active: false,
  requestId: "",
  conversationId: "",
  questionList: [] as PlanQuestionItem[],
  currentIndex: 0,
  answers: {} as Record<string, PlanQuestionSelection | undefined>,
  customDrafts: {} as Record<string, string>,
});

function resetUi() {
  planQuestionsUi.active = false;
  planQuestionsUi.requestId = "";
  planQuestionsUi.conversationId = "";
  planQuestionsUi.questionList = [];
  planQuestionsUi.currentIndex = 0;
  planQuestionsUi.answers = {};
  planQuestionsUi.customDrafts = {};
}

export function openPlanQuestionsSession(input: {
  requestId: string;
  conversationId: string;
  questionList: PlanQuestionItem[];
}): Promise<PlanQuestionsUserResult> {
  if (pending) {
    pending.reject(new Error("plan questions session replaced"));
    pending = null;
  }

  resetUi();
  planQuestionsUi.active = true;
  planQuestionsUi.requestId = input.requestId;
  planQuestionsUi.conversationId = input.conversationId;
  planQuestionsUi.questionList = input.questionList;
  planQuestionsUi.currentIndex = 0;

  return new Promise((resolve, reject) => {
    pending = {
      requestId: input.requestId,
      conversationId: input.conversationId,
      questionList: input.questionList,
      resolve,
      reject,
    };
  });
}

export function finishPlanQuestionsSession(result: PlanQuestionsUserResult): void {
  if (!pending) return;
  pending.resolve(result);
  pending = null;
  resetUi();
}

export function cancelPlanQuestionsSession(reason?: string): void {
  if (!pending) return;
  pending.reject(new Error(reason || "plan questions cancelled"));
  pending = null;
  resetUi();
}

export function isPlanQuestionsActiveForConversation(conversationId: string): boolean {
  return planQuestionsUi.active && planQuestionsUi.conversationId === conversationId.trim();
}
