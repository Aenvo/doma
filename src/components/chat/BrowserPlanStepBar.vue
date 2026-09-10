<template>
  <div v-if="steps.length" class="browser-plan-step-bar" role="region" :aria-label="planTitle">
    <div class="plan-step-bar-header">
      <span
        class="plan-step-bar-title"
        :class="{ 'plan-step-bar-title--named': !!planName?.trim() }"
      >{{ planTitle }}</span>
      <button
        type="button"
        class="plan-step-bar-cancel"
        :aria-label="t('chat.plan.cancel')"
        @click="onCancelClick"
      >
        {{ t("chat.plan.cancel") }}
      </button>
    </div>
    <div class="plan-step-bar-steps" role="list">
      <template v-for="(step, index) in steps" :key="step.id">
        <div
          class="plan-step-item"
          :class="`plan-step-item--${step.status}`"
          role="listitem"
        >
          <span class="plan-step-icon" :class="`plan-step-icon--${step.status}`" aria-hidden="true">
            <span v-if="step.status === 'doing'" class="plan-step-spinner" />
            <svg
              v-else-if="step.status === 'done'"
              class="plan-step-glyph"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3.5 8.2L6.4 11.1L12.5 5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg
              v-else-if="step.status === 'failed'"
              class="plan-step-glyph"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5 5L11 11M11 5L5 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </span>
          <span class="plan-step-title">{{ step.title }}</span>
        </div>
        <div
          v-if="index < steps.length - 1"
          class="plan-step-line"
          :class="{ 'plan-step-line--done': step.status === 'done' }"
          aria-hidden="true"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatBrowserPlanBarTitle } from "@/services/chat/interactionBlockSendHints";
import type { BrowserPlanStep } from "@/services/chat/browserPlanSteps";

const props = defineProps<{
  steps: BrowserPlanStep[];
  planId?: string;
  planName?: string;
}>();

const emit = defineEmits<{
  cancel: [payload: { planId?: string; planName?: string }];
}>();

const { t } = useI18n();
const planTitle = computed(() => formatBrowserPlanBarTitle(props.planName, t));

function onCancelClick() {
  emit("cancel", {
    planId: props.planId,
    planName: props.planName,
  });
}
</script>

<style scoped lang="less">
@plan-step-done: #1f8f4a;

.browser-plan-step-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--stay-border, rgba(0, 0, 0, 0.08));
  background: var(--stay-background, #f8f8f6);
  box-sizing: border-box;
}

.plan-step-bar-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.plan-step-bar-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--stay-text-body, 14px);
  font-weight: 600;
  line-height: 1.35;
  color: var(--stay-black, #2f3134);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &--named {
    font-size: var(--stay-text-footnote, 12px);
    font-weight: 400;
  }
}

.plan-step-bar-cancel {
  flex-shrink: 0;
  margin: 0;
  padding: 2px 8px;
  border: 1px solid var(--stay-border, rgba(0, 0, 0, 0.12));
  border-radius: 4px;
  background: transparent;
  color: var(--stay-black, #2f3134);
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 500;
  line-height: 1.35;
  cursor: pointer;

  &:hover {
    background: rgba(47, 49, 52, 0.06);
  }

  &:active {
    background: rgba(47, 49, 52, 0.1);
  }
}

.plan-step-bar-steps {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  row-gap: 6px;
  width: 100%;
  min-width: 0;
}

.plan-step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  max-width: 100%;
  min-width: 0;
}

.plan-step-icon {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.plan-step-icon--pending {
  border: 1px solid var(--stay-black, #2f3134);
  background: transparent;
}

.plan-step-icon--doing {
  width: 12px;
  height: 12px;
  border: none;
  background: transparent;
}

.plan-step-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid rgba(47, 49, 52, 0.18);
  border-top-color: var(--stay-black, #2f3134);
  animation: plan-step-spin 0.8s linear infinite;
}

@keyframes plan-step-spin {
  to {
    transform: rotate(360deg);
  }
}

.plan-step-icon--done {
  width: 12px;
  height: 12px;
  background: @plan-step-done;
  color: #fff;
  border: none;
}

.plan-step-icon--failed {
  width: 12px;
  height: 12px;
  background: #ef4444;
  color: #fff;
  border: none;
}

.plan-step-line {
  flex: 0 0 12px;
  width: 12px;
  height: 1px;
  margin: 0 6px;
  background: var(--stay-black, #2f3134);
}

.plan-step-line--done {
  background: @plan-step-done;
}

.plan-step-glyph {
  width: 8px;
  height: 8px;
  display: block;
}

.plan-step-title {
  font-size: var(--stay-text-footnote, 12px);
  font-weight: 600;
  line-height: 1.35;
  color: var(--stay-black, #2f3134);
  white-space: normal;
  word-break: break-word;
}
</style>
