import { getContext } from "@/services/Context";

/** 侧栏新手引导是否已完成（跳过或走完） */
export const ONBOARDING_DONE_STORAGE_KEY = "doma_sidepanel_onboarding_v1_done";

export type OnboardingStepId =
  | "newChat"
  | "groupSession"
  | "history"
  | "scheduled"
  | "downloader"
  | "tempData"
  | "connector";

/** 引导顺序：右侧 header 工具栏从左到右 */
export const ONBOARDING_STEP_IDS: OnboardingStepId[] = [
  "newChat",
  "groupSession",
  "history",
  "scheduled",
  "downloader",
  "tempData",
  "connector",
];

function storageLocalGet(key: string): Promise<unknown> {
  const browser = getContext().browser;
  return new Promise((resolve) => {
    try {
      browser.storage.local.get(key, (result: Record<string, unknown>) => {
        if (browser.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(result?.[key] ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function storageLocalSet(key: string, value: unknown): Promise<void> {
  const browser = getContext().browser;
  return new Promise((resolve, reject) => {
    try {
      browser.storage.local.set({ [key]: value }, () => {
        if (browser.runtime?.lastError) {
          reject(new Error(String(browser.runtime.lastError.message)));
          return;
        }
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function isOnboardingDone(): Promise<boolean> {
  const v = await storageLocalGet(ONBOARDING_DONE_STORAGE_KEY);
  return v === true || v === "true" || v === 1;
}

export async function setOnboardingDone(): Promise<void> {
  await storageLocalSet(ONBOARDING_DONE_STORAGE_KEY, true);
}

/** 首次对话示例提示（header 引导结束后） */
export const FIRST_CHAT_PROMPT_DONE_STORAGE_KEY = "doma_first_chat_prompt_v1_done";

export async function isFirstChatPromptDone(): Promise<boolean> {
  const v = await storageLocalGet(FIRST_CHAT_PROMPT_DONE_STORAGE_KEY);
  return v === true || v === "true" || v === 1;
}

export async function setFirstChatPromptDone(): Promise<void> {
  await storageLocalSet(FIRST_CHAT_PROMPT_DONE_STORAGE_KEY, true);
}
