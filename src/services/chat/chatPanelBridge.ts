import { getTabIdByConversationIdFromDisk } from "@/services/chat/conversationContextStore";
import { sendToSidePanel } from "@/edition/sendToSidePanel";
import { isSafariBuild } from "@/utils/safariBuild";
import { getContext } from "@/services/Context";
import {
  resolveSafariMcpResponseTabId,
  safariPanelOpenFlags,
} from "@/services/chat/safariPanelHostTab";

/** Safari：问 panelShell content 要宿主 tabId */
async function getTabIdFromSafariShell(conversationId: string): Promise<number | undefined> {
  const browser = getContext().browser as any;
  const candidates: number[] = [];
  for (const [tid, open] of safariPanelOpenFlags()) {
    if (open === true && typeof tid === "number" && Number.isFinite(tid)) {
      candidates.push(tid);
    }
  }
  const remembered = resolveSafariMcpResponseTabId(null);
  if (typeof remembered === "number" && !candidates.includes(remembered)) {
    candidates.push(remembered);
  }

  const askShell = (tabId: number): Promise<number | undefined> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(undefined);
      }, 3000);
      try {
        browser.tabs.sendMessage(
          tabId,
          {
            origin: "background",
            operate: "safariPanel/getHostTabId",
            conversationId,
          },
          (res: { tabId?: number } | undefined) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (browser.runtime.lastError) {
              resolve(undefined);
              return;
            }
            const id = res?.tabId;
            resolve(typeof id === "number" && Number.isFinite(id) ? id : undefined);
          },
        );
      } catch {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    });

  for (const tabId of candidates) {
    const got = await askShell(tabId);
    if (got != null) return got;
    return tabId;
  }
  return undefined;
}

/** 优先 storage.local；miss 时 Chrome 侧栏 / Safari panelShell */
export async function getTabIdByConversationId(conversationId: string): Promise<number | undefined> {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return undefined;
  try {
    const fromStorage = await getTabIdByConversationIdFromDisk(id);
    if (fromStorage != null) return fromStorage;
  } catch {
    // fall through
  }
  if (isSafariBuild()) {
    return getTabIdFromSafariShell(id);
  }
  try {
    const res = (await sendToSidePanel<{ tabId?: number }>({
      operate: "chat/getTabIdByConversationId",
      conversationId: id,
    })) as { tabId?: number } | undefined;
    const tabId = res?.tabId;
    return typeof tabId === "number" && Number.isFinite(tabId) ? tabId : undefined;
  } catch {
    return undefined;
  }
}
