<template>
  <div
    v-if="active"
    ref="rootRef"
    class="onboarding-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="cardTitle"
  >
    <div class="onboarding-spotlight" :style="spotlightStyle" aria-hidden="true" />
    <div class="onboarding-card">
      <div class="onboarding-progress">{{ progressLabel }}</div>
      <div class="onboarding-title">{{ cardTitle }}</div>
      <div class="onboarding-body">{{ cardBody }}</div>
      <div class="onboarding-actions">
        <button type="button" class="onboarding-btn onboarding-btn--ghost" @click="onSkip">
          {{ t("chat.onboarding.skip") }}
        </button>
        <button type="button" class="onboarding-btn onboarding-btn--primary" @click="onNext">
          {{ isLast ? t("chat.onboarding.done") : t("chat.onboarding.next") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ONBOARDING_STEP_IDS,
  setOnboardingDone,
  type OnboardingStepId,
} from "@/services/chat/onboardingStore";

const props = defineProps<{
  /** 相对定位的侧栏根节点，用于 query 与坐标换算 */
  panelSelector?: string;
}>();

const emit = defineEmits<{
  (e: "done"): void;
}>();

const { t } = useI18n();

const active = ref(true);
const stepIndex = ref(0);
const rootRef = ref<HTMLElement | null>(null);

const PAD = 4;

const spotlight = ref({ top: 0, left: 0, width: 0, height: 0, ready: false });

const stepId = computed<OnboardingStepId>(
  () => ONBOARDING_STEP_IDS[stepIndex.value] ?? "newChat",
);

const isLast = computed(() => stepIndex.value >= ONBOARDING_STEP_IDS.length - 1);

const cardTitle = computed(() => t(`chat.onboarding.steps.${stepId.value}.title`));
const cardBody = computed(() => t(`chat.onboarding.steps.${stepId.value}.body`));
const progressLabel = computed(() =>
  t("chat.onboarding.progress", {
    current: stepIndex.value + 1,
    total: ONBOARDING_STEP_IDS.length,
  }),
);

const spotlightStyle = computed(() => {
  if (!spotlight.value.ready) {
    return { opacity: 0 };
  }
  const { top, left, width, height } = spotlight.value;
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: 1,
  };
});

function panelEl(): HTMLElement | null {
  if (props.panelSelector) {
    return document.querySelector(props.panelSelector) as HTMLElement | null;
  }
  return rootRef.value?.parentElement ?? null;
}

function measure(): void {
  const panel = panelEl();
  if (!panel || !rootRef.value) return;
  const target = panel.querySelector(
    `[data-onboarding="${stepId.value}"]`,
  ) as HTMLElement | null;
  if (!target) {
    spotlight.value = { ...spotlight.value, ready: false };
    return;
  }
  const pr = panel.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  spotlight.value = {
    top: tr.top - pr.top - PAD,
    left: tr.left - pr.left - PAD,
    width: tr.width + PAD * 2,
    height: tr.height + PAD * 2,
    ready: true,
  };
}

async function finish(): Promise<void> {
  active.value = false;
  try {
    await setOnboardingDone();
  } catch (e) {
    console.warn("[onboarding] persist done failed:", e);
  }
  emit("done");
}

function onSkip(): void {
  void finish();
}

function onNext(): void {
  if (isLast.value) {
    void finish();
    return;
  }
  stepIndex.value += 1;
}

watch(stepIndex, async () => {
  await nextTick();
  measure();
});

let ro: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();
  measure();
  const panel = panelEl();
  if (panel && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => measure());
    ro.observe(panel);
  }
  window.addEventListener("resize", measure);
});

onUnmounted(() => {
  ro?.disconnect();
  window.removeEventListener("resize", measure);
});
</script>

<style scoped lang="less">
.onboarding-overlay {
  position: absolute;
  inset: 0;
  z-index: 500;
  overflow: hidden;
  pointer-events: auto;
  /* 全屏遮罩；高亮靠 spotlight 的巨大 box-shadow 挖洞 */
  background: transparent;
}

.onboarding-spotlight {
  position: absolute;
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.58);
  pointer-events: none;
  transition:
    top 0.2s ease,
    left 0.2s ease,
    width 0.2s ease,
    height 0.2s ease,
    opacity 0.15s ease;
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: 0;
  z-index: 1;
}

.onboarding-card {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 28%;
  z-index: 2;
  padding: 16px 16px 14px;
  border-radius: 14px;
  background: var(--stay-backgroundSecondary, #fff);
  border: 1px solid var(--stay-border, #e0e0e0);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
}

.onboarding-progress {
  font-size: 12px;
  font-weight: 500;
  color: #8a8a8a;
  margin-bottom: 8px;
}

.onboarding-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--stay-black, #222);
  line-height: 1.35;
  margin-bottom: 6px;
}

.onboarding-body {
  font-size: 13px;
  font-weight: 400;
  color: var(--stay-secondaryFont, #555);
  line-height: 1.45;
  white-space: pre-wrap;
}

.onboarding-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.onboarding-btn {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 15px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  line-height: 30px;
}

.onboarding-btn--ghost {
  background: var(--stay-backgroundTertiary, rgba(0, 0, 0, 0.06));
  color: var(--stay-black, #333);

  &:hover {
    opacity: 0.88;
  }
}

.onboarding-btn--primary {
  background: var(--stay-black, #222);
  color: var(--stay-backgroundSecondary, #fff);

  &:hover {
    opacity: 0.88;
  }
}
</style>
