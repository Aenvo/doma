<template>
  <div class="plan-questions-card" role="form" :aria-label="t('chat.planQuestions.title')">
    <div class="plan-questions-header">
      <span class="plan-questions-title">{{ t("chat.planQuestions.title") }}</span>
      <div class="plan-questions-nav">
        <button
          type="button"
          class="plan-questions-nav-btn"
          :disabled="ui.currentIndex <= 0"
          aria-label="Previous question"
          @click="goPrev"
        >
          ‹
        </button>
        <span class="plan-questions-counter">{{ ui.currentIndex + 1 }} / {{ ui.questionList.length }}</span>
        <button
          type="button"
          class="plan-questions-nav-btn"
          :disabled="ui.currentIndex >= ui.questionList.length - 1"
          aria-label="Next question"
          @click="goNext"
        >
          ›
        </button>
      </div>
    </div>

    <div v-if="currentQuestion" class="plan-questions-body">
      <p class="plan-questions-question">{{ currentQuestion.question }}</p>
      <div class="plan-questions-options">
        <button
          v-for="opt in currentQuestion.optionsList"
          :key="opt.id"
          type="button"
          class="plan-questions-option"
          :class="{ 'plan-questions-option--selected': isOptionSelected(currentQuestion.id, opt.id) }"
          @click="selectOption(currentQuestion.id, opt)"
        >
          <span class="plan-questions-option-label">{{ opt.label }}</span>
          <span class="plan-questions-option-text">{{ opt.value }}</span>
        </button>
        <div
          class="plan-questions-option plan-questions-option--custom"
          :class="{ 'plan-questions-option--selected': isCustomSelected(currentQuestion.id) }"
        >
          <span class="plan-questions-option-label">{{ customOptionLabel }}</span>
          <input
            v-model="customDraft"
            type="text"
            class="plan-questions-custom-input"
            :placeholder="t('chat.planQuestions.customPlaceholder')"
            @focus="onCustomInput(currentQuestion.id)"
            @input="onCustomInput(currentQuestion.id)"
          />
        </div>
      </div>
    </div>

    <div class="plan-questions-footer">
      <button type="button" class="plan-questions-btn plan-questions-btn--ghost" @click="onSkip">
        {{ t("chat.planQuestions.skip") }}
      </button>
      <button
        type="button"
        class="plan-questions-btn plan-questions-btn--primary"
        @click="onSubmit"
      >
        {{ t("chat.planQuestions.submit") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  finishPlanQuestionsSession,
  getCustomOptionLabel,
  planQuestionsUi,
  type PlanQuestionOption,
} from "@/services/chat/planQuestionsSession";

const { t } = useI18n();
const ui = planQuestionsUi;

const currentQuestion = computed(() => ui.questionList[ui.currentIndex]);

const customOptionLabel = computed(() =>
  currentQuestion.value
    ? getCustomOptionLabel(currentQuestion.value.optionsList.length)
    : "C",
);

const customDraft = computed({
  get: () => {
    const q = currentQuestion.value;
    if (!q) return "";
    return ui.customDrafts[q.id] ?? "";
  },
  set: (val: string) => {
    const q = currentQuestion.value;
    if (!q) return;
    ui.customDrafts[q.id] = val;
  },
});

function isOptionSelected(questionId: string, optionId: string): boolean {
  const sel = ui.answers[questionId];
  return sel?.kind === "option" && sel.optionId === optionId;
}

function isCustomSelected(questionId: string): boolean {
  return ui.answers[questionId]?.kind === "custom";
}

function selectOption(questionId: string, opt: PlanQuestionOption) {
  ui.answers[questionId] = {
    kind: "option",
    optionId: opt.id,
    label: opt.label,
    value: opt.value,
  };
  ui.customDrafts[questionId] = "";
}

function onCustomInput(questionId: string) {
  const q = ui.questionList.find((item) => item.id === questionId);
  const label = q ? getCustomOptionLabel(q.optionsList.length) : "C";
  const text = (ui.customDrafts[questionId] ?? "").trim();
  if (!text) {
    delete ui.answers[questionId];
    return;
  }
  ui.answers[questionId] = { kind: "custom", label, value: text };
}

function goPrev() {
  if (ui.currentIndex > 0) ui.currentIndex -= 1;
}

function goNext() {
  if (ui.currentIndex < ui.questionList.length - 1) ui.currentIndex += 1;
}

function onSkip() {
  finishPlanQuestionsSession({ skipped: true });
}

function onSubmit() {
  const answered = ui.questionList
    .filter((q) => !!ui.answers[q.id])
    .map((q) => ({
      questionId: q.id,
      question: q.question,
      selection: ui.answers[q.id]!,
    }));

  finishPlanQuestionsSession({
    skipped: false,
    answers: answered,
  });
}
</script>

<style scoped lang="less">
.plan-questions-card {
  width: 100%;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(47, 49, 52, 0.04);
  box-sizing: border-box;
}

.plan-questions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  border-bottom: 1px solid var(--stay-border, #d0d0d0);
  background: rgba(47, 49, 52, 0.06);
  box-sizing: border-box;
}

.plan-questions-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(47, 49, 52, 0.72);
}

.plan-questions-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.plan-questions-nav-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 6px;
  background: #fff;
  color: var(--stay-black, #2f3134);
  cursor: pointer;
  line-height: 1;

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.plan-questions-counter {
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-secondaryFont, #6b7280);
  min-width: 44px;
  text-align: center;
}

.plan-questions-body {
  padding: 8px;
}

.plan-questions-question {
  margin: 0 0 8px;
  padding: 0 4px;
  font-size: var(--stay-text-body, 14px);
  line-height: 1.45;
  color: var(--stay-black, #2f3134);
}

.plan-questions-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-questions-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--stay-border, #d0d0d0);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;

  &--selected {
    border-color: var(--stay-black, #2f3134);
    background: rgba(47, 49, 52, 0.04);
  }

  &--custom {
    cursor: text;
  }
}

.plan-questions-option-label {
  flex-shrink: 0;
  width: 16px;
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 600;
  color: var(--stay-secondaryFont, #6b7280);
}

.plan-questions-option-text {
  flex: 1;
  min-width: 0;
  font-size: var(--stay-text-footnote, 12px);
  line-height: 1.4;
  color: var(--stay-black, #2f3134);
  word-break: break-word;
}

.plan-questions-custom-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--stay-text-footnote, 12px);
  color: var(--stay-black, #2f3134);
}

.plan-questions-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 8px 8px;
}

.plan-questions-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: var(--stay-text-footnote, 12px);
  cursor: pointer;

  &--ghost {
    border: 1px solid var(--stay-border, #d0d0d0);
    background: #fff;
    color: var(--stay-secondaryFont, #6b7280);
  }

  &--primary {
    border: 1px solid var(--stay-black, #2f3134);
    background: var(--stay-black, #2f3134);
    color: #fff;

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
}
</style>
