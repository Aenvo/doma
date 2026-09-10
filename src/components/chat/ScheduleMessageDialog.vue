<template>
  <Teleport to="body">
    <div v-if="visible" class="sched-overlay" @click.self="onCancel">
      <div class="sched-dialog" role="dialog" aria-modal="true" :aria-label="title">
        <div class="sched-header">
          <h2 class="sched-title">{{ title }}</h2>
          <button type="button" class="sched-close" aria-label="关闭" @click="onCancel">×</button>
        </div>

        <div class="sched-body">
          <p v-if="previewText" class="sched-preview">{{ previewText }}</p>

          <label class="sched-field">
            <span class="sched-label">{{ dateTimeLabel }}</span>
            <input
              v-model="dateTimeLocal"
              type="datetime-local"
              class="sched-input"
              :min="minDateTimeLocal"
            />
          </label>

          <label class="sched-field">
            <span class="sched-label">{{ repeatLabel }}</span>
            <select v-model="repeat" class="sched-input">
              <option value="none">{{ repeatNone }}</option>
              <option value="daily">{{ repeatDaily }}</option>
              <option value="hourly">{{ repeatHourly }}</option>
              <option value="minutes">{{ repeatMinutes }}</option>
            </select>
          </label>

          <label v-if="repeat === 'minutes'" class="sched-field">
            <span class="sched-label">{{ intervalMinutesLabel }}</span>
            <input
              v-model.number="intervalMinutes"
              type="number"
              class="sched-input"
              min="1"
              step="1"
              :placeholder="intervalMinutesPlaceholder"
            />
          </label>

          <p v-if="displayError" class="sched-error">{{ displayError }}</p>
        </div>

        <div class="sched-footer">
          <button type="button" class="sched-btn sched-btn--ghost" @click="onCancel">
            {{ cancelText }}
          </button>
          <button type="button" class="sched-btn sched-btn--primary" :disabled="saving" @click="onSubmit">
            {{ saving ? savingText : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  normalizeIntervalMinutes,
  type ScheduledRepeat,
} from "@/services/chat/scheduledMessagesStore";

export type ScheduleMessageConfirmPayload = {
  runAt: number;
  repeat: ScheduledRepeat;
  intervalMinutes?: number;
};

const props = defineProps<{
  visible: boolean;
  text: string;
  title: string;
  dateTimeLabel: string;
  repeatLabel: string;
  repeatNone: string;
  repeatDaily: string;
  repeatHourly: string;
  repeatMinutes: string;
  intervalMinutesLabel: string;
  intervalMinutesPlaceholder: string;
  invalidIntervalText: string;
  cancelText: string;
  confirmText: string;
  savingText: string;
  invalidTimeText: string;
  /** 编辑时回填 */
  initialRunAt?: number;
  initialRepeat?: ScheduledRepeat;
  initialIntervalMinutes?: number;
  /** 父组件创建失败时回显 */
  submitError?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [ScheduleMessageConfirmPayload];
}>();

const dateTimeLocal = ref("");
const repeat = ref<ScheduledRepeat>("none");
const intervalMinutes = ref(15);
const saving = ref(false);
const errorText = ref("");
/** 刚打开时忽略遮罩关闭，防止菜单点击穿透 */
let openedAtMs = 0;

const previewText = computed(() => {
  const t = props.text.trim();
  if (!t) return "";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
});

const displayError = computed(() => props.submitError?.trim() || errorText.value);

function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const minDateTimeLocal = computed(() => toLocalInputValue(Date.now()));

function resetForm() {
  const initRunAt = props.initialRunAt;
  const runAt =
    typeof initRunAt === "number" && initRunAt > Date.now()
      ? initRunAt
      : Date.now() + 5 * 60 * 1000;
  dateTimeLocal.value = toLocalInputValue(runAt);
  const r = props.initialRepeat;
  repeat.value =
    r === "none" || r === "hourly" || r === "minutes" || r === "daily" ? r : "none";
  intervalMinutes.value =
    typeof props.initialIntervalMinutes === "number" && props.initialIntervalMinutes >= 1
      ? Math.floor(props.initialIntervalMinutes)
      : 15;
  saving.value = false;
  errorText.value = "";
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      resetForm();
      openedAtMs = Date.now();
    }
  },
);

function onCancel() {
  if (saving.value) return;
  if (Date.now() - openedAtMs < 350) return;
  emit("cancel");
}

async function onSubmit() {
  errorText.value = "";
  const runAt = Date.parse(dateTimeLocal.value);
  if (!Number.isFinite(runAt) || runAt <= Date.now()) {
    errorText.value = props.invalidTimeText;
    return;
  }
  if (repeat.value === "minutes") {
    const mins = Number(intervalMinutes.value);
    if (!Number.isFinite(mins) || mins < 1) {
      errorText.value = props.invalidIntervalText;
      return;
    }
  }
  saving.value = true;
  try {
    emit("confirm", {
      runAt,
      repeat: repeat.value,
      intervalMinutes:
        repeat.value === "minutes" ? normalizeIntervalMinutes(intervalMinutes.value) : undefined,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="less">
.sched-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.sched-dialog {
  width: min(360px, 100%);
  border-radius: 12px;
  background: var(--stay-backgroundSecondary, #1e1e1e);
  border: 1px solid var(--stay-border, #333);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  color: var(--stay-black);
}

.sched-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.sched-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.sched-close {
  border: none;
  background: transparent;
  color: var(--stay-secondaryFont);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;

  &:hover {
    background: var(--stay-border);
  }
}

.sched-body {
  padding: 8px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sched-preview {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--stay-border);
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 88px;
  overflow: auto;
}

.sched-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sched-label {
  font-size: 12px;
  color: var(--stay-secondaryFont);
}

.sched-input {
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border);
  background: var(--stay-backgroundTertiary, #2a2a2a);
  color: var(--stay-black);
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: var(--stay-primary, #4c8bf5);
  }
}

.sched-error {
  margin: 0;
  color: var(--stay-error, #e74c3c);
  font-size: 12px;
}

.sched-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px;
}

.sched-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;

  &--ghost {
    background: transparent;
    border-color: var(--stay-border);
    color: var(--stay-black);

    &:hover {
      background: var(--stay-border);
    }
  }

  &--primary {
    background: var(--stay-primary, #4c8bf5);
    color: #fff;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }
}
</style>
