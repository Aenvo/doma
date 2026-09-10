console.log("service-worker.js");
import { getContext, getCurrentTab } from "../../services/Context";
import { createFileLoader } from "@/utils/fileLoader";
import { switchToStayExtension } from "@/services/extensionService";
import { runBrowserTool, getCommands, getSkills, saveUserSkillFromForm, deleteUserSkill, getUserSkillForEdit } from "@/services/chat/browserTools";
import {
  replaceConversationMapsFromPersisted,
  upsertConversationContext,
} from "@/services/chat/conversationContextStore";
import { awaitConversationContextPersistenceReady } from "@/services/chat/conversationContextPersistence";
import { Storage } from "@/store/Storage";
import { putUploadBlobs, mergeUploadParsedSheets } from "@/services/chat/uploadFileStore";
import {
  armScheduledAlarm,
  clearScheduledAlarm,
  registerScheduledAlarmsListener,
} from "@/services/chat/scheduledMessagesSw";
import type { ScheduledMessage } from "@/services/chat/scheduledMessagesStore";
import { bootstrapEdition } from "@/edition/editionBootstrap";
import {
  tryHandleEditionSwMessage,
  registerEditionEarly,
  initEditionBackground,
  registerEditionTabListeners,
} from "@/edition/editionSwHooks";

/** 工具结果经 JSON 往返再 sendResponse，避免含不可克隆字段时抛错 → 前端收不到 success。 */
function toExtensionMessagePayload(value: unknown): unknown {
  try {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return { _note: "non-serializable tool result", asString: String(value) };
  }
}

import { createMcpServer } from "@/services/mcp/mcpServer";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ExtensionServerTransport } from "@/services/mcp/extensionTransport";
import { getConversationContext, getConversationIdByTabId, removeConversationByGroupId, removeConversationByTabId } from "@/services/chat/conversationContextStore";
import { StayWebExtensionHandler } from "@/services/extension/StayWebExtensionHandler";
const SIDE_PANEL_PATH = "popup/index.html#sidepannel";

class Background{
    showSidePanel: boolean = false;
    fileLoaderHandler?: any;
    extensionHandler: StayWebExtensionHandler;
    transport = new ExtensionServerTransport();
    mcpServer: Server;
    iframeMap: Map<string, any> = new Map();
    migrateConversationMap: Map<string, string> = new Map();
    constructor(){
      console.log("Background constructor...");
      this.extensionHandler = new StayWebExtensionHandler();
      this.mcpServer = createMcpServer(this.transport);
      (async () => {
        this.showSidePanel = await Storage.init().get("doma_agent_side_pannel_status") || false;
      })();
      
    }

    /** 窗口级侧栏：不按 tabId 绑定，避免每 tab 一份 ChatPanel 实例 */
    private async setGlobalSidePanelEnabled(enabled: boolean): Promise<void> {
      const browser = getContext().browser as any;
      if (!browser.sidePanel?.setOptions) return;
      await browser.sidePanel.setOptions({
        path: SIDE_PANEL_PATH,
        enabled,
      });
    }

    private async registerConversationHooks() {
      const browser = getContext().browser;
    
      browser.tabs.onRemoved.addListener(async (tabId: number) => {
        await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
        const conversationId = await getConversationIdByTabId(tabId);
        if (!conversationId) return;
        const conversation = getConversationContext(conversationId);
        if (conversation && conversation.mode === "group") {
          const tabs = await browser.tabs.query({ groupId: conversation.groupId });
          if (tabs.length === 0) {
            upsertConversationContext({
              conversationId,
              groupWorkingTabId: undefined
            });
          }
          else{
            upsertConversationContext({
              conversationId,
              groupWorkingTabId: tabs[tabs.length - 1].id,
              tabInfo: {
                url: tabs[tabs.length - 1].url,
                icon: tabs[tabs.length - 1].favIconUrl
              }
            });
          }
        }
        else if (conversation && conversation.mode === "single") {
          removeConversationByTabId(tabId);
        }
      });
    
      browser.tabGroups?.onRemoved.addListener(async (group: any) => {
        if (group?.id != null) {
          await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
          removeConversationByGroupId(group.id);
        }
      });
    }

    public backToCurrentTab(tabId: number){
      console.log("backToCurrentTab-----", tabId)
      if(tabId && tabId>0){
        console.log("backToCurrentTab---update--", tabId)
        getContext().browser.tabs.update(tabId, { active: true });  
      }else{
        // console.log("backToCurrentTab---switchToStayExtension--", tabId)
        // switchToStayExtension(null)
      }
    }

    listener(request: any, sender: any, sendResponse: (response: any)=> void){
      console.log("receive message-----",request,sender);
      const {origin, operate} = request;
      if (operate.startsWith('background')){
        if (origin === 'content'){
          if (operate.startsWith('background/v3/gmapi')){
            if (!tryHandleEditionSwMessage(request, sender, sendResponse)) {
              sendResponse({});
            }
          }
          else{
            if(operate === 'background/v3/runtime.getManifest'){
              sendResponse(getContext().browser.runtime.getManifest());
            }
            else if(operate === 'background/v3/storage.local.get'){
              (async () => {
                const gettingItem = await getContext().browser.storage.local.get(request.keys);
                sendResponse(gettingItem);
              })();
            }
            else if(operate === 'background/v3/storage.local.set'){
              (async () => {  
                await getContext().browser.storage.local.set(request.keys);
                sendResponse({success: true});
              })();
            }
            else if (operate === 'background/v3/storage.local.list'){
              (async () => {
                const listingItem = await getContext().browser.storage.local.get(null);
                if (listingItem){
                  const prefix = `_${request.uuid}_`;
                  const keys: Record<string, any> = {};
                  const allKeys = Object.keys(listingItem);
                  for (let i = 0; i < allKeys.length; i++){
                    const key = allKeys[i];
                    if (key.startsWith(prefix)) {
                      keys[key] = listingItem[key];
                    }
                  }
                  sendResponse(keys);
                }
                else{
                  sendResponse({});
                }
              })();
            }
            else if (operate === 'background/v3/storage.local.remove'){
              (async () => {
                await getContext().browser.storage.local.remove(request.keys);
                sendResponse({success: true});
              })();
            }
            else if (operate === 'background/v3/runtime.getURL'){
              sendResponse(getContext().browser.runtime.getURL(request.path));
            }
            else if (operate === 'background/v3/switchUser'){
              if (!tryHandleEditionSwMessage(request, sender, sendResponse)) {
                sendResponse({ success: true });
              }
            }
            else{
              this.extensionHandler.handle(request, sender, sendResponse, getContext());
            }
          }
        }
      }
      else if (operate.startsWith('event')){
        if (operate === 'event/post'){
          const options = getContext().browser.runtime.getURL('options/index.html');
          const sidepanel = getContext().browser.runtime.getURL('popup/index.html#sidepanel');
          if (sender.url == options){
            getContext().browser.runtime.sendMessage({
              origin: 'background',
              operate: 'event/post',
              type: request.type,
              data: request.data,
              targetUrl: sidepanel
            });
          }
          else if (sender.url == sidepanel){
            getContext().browser.runtime.sendMessage({
              origin: 'background',
              operate: 'event/post',
              type: request.type,
              data: request.data,
              targetUrl: options
            });
          }
          sendResponse({success: true});
          // console.log("event/post", request, sender, options, sidepanel);
        }
      }
      
      else if (tryHandleEditionSwMessage(request, sender, sendResponse)) {
        // Pro：login/* 等版别消息
      }
      else if(operate.startsWith('jump')){
        const jumpPath = request.jump || ""
        switchToStayExtension(jumpPath); 
        sendResponse({success: true});
      }
      else if (operate == 'cs-fetch'){
        (async () => {
          const id = request.id;
          const tabId = sender.tab.id; 
          const frameId = sender.frameId;

          const sendFileResponse = (response: any) => {
            response = response ? response : {}
            // console.log("sendFileResponse---bg-fetch-response-----id-",id, tabId, new Date().getTime(), response)
            getContext().browser.tabs.sendMessage(tabId, 
                {
                    type: 'bg-fetch-response',
                    id,
                    ...response
                },
                {frameId}
            );
          }

          try {
            const { url, responseType, mimeType, origin } = request.data as any;
            if(!this.fileLoaderHandler){
              this.fileLoaderHandler = createFileLoader();
            }
            const res = await this.fileLoaderHandler.getUrlData({ url, responseType, mimeType, origin });
            sendFileResponse({data:res});
          } catch (err: any) {
            sendFileResponse({error: err && err.message ? err.message : err});
          }
          sendResponse("success");
        })();
      }
      else if (operate=='openTab'){
        getContext().browser.tabs.create({
          url: request.url,
          active: true
        }).then((tab: any) => {
          sendResponse({success: true, tab: tab});
        }).catch((error: any) => {
          sendResponse({success: false, error: error.message});
        });
      }
      else if (operate=='updateCurrentTab'){
        getContext().browser.tabs.query({ active: true, currentWindow: true }, function(tabs: any) {
          if (tabs.length > 0) {
            let currentTab = tabs[0]; // 当前活动 tab
            getContext().browser.tabs.update(currentTab.id, {
              url: request.url          
            });
          }
        });
        
        sendResponse({success: true});
      }
      else if (operate.startsWith('downloadFile')){
        const {downloadUrl} = request;
                   
        (async () => {
          if(!this.fileLoaderHandler){
            this.fileLoaderHandler = createFileLoader();
          }
          const res = await this.fileLoaderHandler.getUrlData({ url: downloadUrl, responseType: 'data-url', mimeType: ""});
          sendResponse({success: res});
        })();
      }
      // Stay AI chat browser tool handler
      else if (operate === "chat/runBrowserTool") {
        const name = request.name as string;
        const args = (request.toolArgs ?? request.arguments) as Record<string, unknown> | undefined;
        console.log("[Chat] runBrowserTool:", name, args);
        (async () => {
          try {
            const result = await runBrowserTool(name, args ?? {});
            console.log("[Chat] tool result:", result);
            sendResponse({ success: true, result: toExtensionMessagePayload(result) });
          } catch (e) {
            console.error("[Chat] tool error:", e);
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/getCommands") {
        sendResponse({ success: true, commands: getCommands() });
      }
      else if (operate === "chat/getSkills") {
        (async () => {
          try {
            sendResponse({ success: true, skills: await getSkills() });
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/saveSkill") {
        (async () => {
          try {
            const payload = request.payload as {
              id?: string;
              name?: string;
              allowModelRoute?: boolean;
              body?: string;
              description?: string;
            };
            const result = await saveUserSkillFromForm({
              id: payload?.id,
              name: payload?.name ?? "",
              allowModelRoute: payload?.allowModelRoute ?? false,
              body: payload?.body ?? "",
              description: payload?.description,
            });
            if (result.ok) {
              sendResponse({ success: true, id: result.id });
            } else {
              sendResponse({ success: false, error: result.error ?? "保存失败" });
            }
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/getSkill") {
        (async () => {
          try {
            const payload = request.payload as { id?: string };
            const skill = await getUserSkillForEdit(payload?.id ?? "");
            if (!skill) {
              sendResponse({ success: false, error: "Skill 不存在" });
              return;
            }
            sendResponse({ success: true, skill });
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/deleteSkill") {
        (async () => {
          try {
            const payload = request.payload as { id?: string };
            const result = await deleteUserSkill(payload?.id ?? "");
            if (result.ok) {
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: result.error ?? "删除失败" });
            }
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/scheduleArm") {
        (async () => {
          try {
            const row = request.payload as Pick<ScheduledMessage, "id" | "runAt"> | undefined;
            if (!row?.id || typeof row.runAt !== "number") {
              sendResponse({ success: false, error: "id/runAt required" });
              return;
            }
            await armScheduledAlarm(row);
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/scheduleClear") {
        (async () => {
          try {
            const id = typeof request.id === "string" ? request.id.trim() : "";
            if (!id) {
              sendResponse({ success: false, error: "id required" });
              return;
            }
            await clearScheduledAlarm(id);
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({ success: false, error: String(e) });
          }
        })();
      }
      else if (origin === "content" && operate === "assistant/copySelection") {
        // content → runtime.sendMessage 在 MV3 下通常只到 service worker；转发给扩展页面（sidepanel 等）
        sendResponse({ ok: true });
        const payload = request as Record<string, unknown>;
        const sourceTabId = sender?.tab?.id;
        queueMicrotask(() => {
          try {
            getContext().browser.runtime
              .sendMessage({
                origin: "background",
                operate: "assistant/copySelectionRelay",
                text: payload.text,
                host: payload.host,
                favicon: payload.favicon,
                selectors: payload.selectors,
                selectionAnchor: payload.selectionAnchor,
                sourceTabId,
              })
              .catch(() => {
                // 无接收端（侧栏未打开等）时忽略
              });
          } catch {
            // ignore
          }
        });
      }
      else if (operate.startsWith('mcp/request')) {
        const rpc = request?.jsonrpc;
        const rpcMeta = {
          id: rpc && typeof rpc === "object" ? (rpc as { id?: unknown }).id ?? null : null,
          method:
            rpc && typeof rpc === "object" && typeof (rpc as { method?: unknown }).method === "string"
              ? (rpc as { method: string }).method
              : null,
          senderOrigin: sender?.url ?? sender?.origin ?? null,
          senderTabId: sender?.tab?.id ?? null,
          t: Date.now(),
        };
        console.log("[MCP-SW] mcp/request received", rpcMeta);
        try {
          this.transport.onmessage(request.jsonrpc);
          console.log("[MCP-SW] mcp/request handed to transport.onmessage", rpcMeta);
        } catch (e) {
          console.error("[MCP-SW] mcp/request transport.onmessage threw", {
            ...rpcMeta,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        // listener 末尾会 return true：必须同步 ack，否则 Chrome 报 channel closed
        // （真正业务结果仍走 mcp/response 广播）
        try {
          sendResponse({ ok: true, accepted: true, via: "mcp/request-ack", ...rpcMeta });
          console.log("[MCP-SW] mcp/request sendResponse ack", rpcMeta);
        } catch (e) {
          console.warn("[MCP-SW] mcp/request sendResponse failed", {
            ...rpcMeta,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      else if (operate === "chat/uploadFilesPut") {
        // sidepanel/popup -> background: store short-lived upload files into IndexedDB
        (async () => {
          try {
            const files = Array.isArray(request.files) ? request.files : [];
            await putUploadBlobs(
              files
                .filter((f: any) => f && typeof f.id === "string" && f.blob)
                .map((f: any) => ({
                  id: String(f.id),
                  blob: f.blob as Blob,
                  name: String(f.name || ""),
                  type: String(f.type || ""),
                  size: Number(f.size || 0),
                  lastModified: Number(f.lastModified || 0),
                })),
            );
            sendResponse({ ok: true, count: files.length });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/uploadFilesPutBase64") {
        (async () => {
          try {
            const f = request.file;
            const id = typeof f?.id === "string" ? f.id : "";
            const base64 = typeof f?.base64 === "string" ? f.base64 : "";
            if (!id || !base64) {
              sendResponse({ ok: false, error: "id/base64 required" });
              return;
            }
            const mimeType = typeof f?.type === "string" && f.type ? f.type : "application/octet-stream";
            const blob = base64ToBlob(base64, mimeType);
            await putUploadBlobs([
              {
                id,
                blob,
                name: String(f?.name || ""),
                type: mimeType,
                size: Number(f?.size || blob.size),
                lastModified: Number(f?.lastModified || 0),
              },
            ]);
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
        })();
      }
      else if (operate === "chat/uploadFilesPutParsed") {
        (async () => {
          try {
            const id = typeof request.id === "string" ? request.id : "";
            const parsedSheets = Array.isArray(request.parsedSheets) ? request.parsedSheets : [];
            if (!id || !parsedSheets.length) {
              sendResponse({ ok: false, error: "id/parsedSheets required" });
              return;
            }
            const ok = await mergeUploadParsedSheets(
              id,
              parsedSheets
                .filter((s: any) => s && typeof s.name === "string" && Array.isArray(s.rows))
                .map((s: any) => ({
                  name: String(s.name),
                  rows: (s.rows as unknown[][]).map((row) =>
                    Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [],
                  ),
                })),
            );
            sendResponse({ ok });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
        })();
      }
      else if (tryHandleEditionSwMessage(request, sender, sendResponse)) {
        // 版别消息：downloader/agent、userscript、ruleTag
      }
      else if (operate.startsWith('iframe/getInfo')){
        const tabId = sender.tab.id;
        const url = request.url;
        if(!url){
          sendResponse({success: false, error: "url required"});
          return;
        }
        const ifrmaeArr = this.iframeMap.get(tabId) || [];
        const iframeInfo = ifrmaeArr.find((iframe: any) => iframe.url === url || new URL(url).hostname === new URL(iframe.url).hostname);

        console.log("service-worker iframe/getInfo----iframeInfo", iframeInfo);
        if(iframeInfo){
          sendResponse({success: true, iframeInfo: iframeInfo});
        }else{
          sendResponse({success: false, error: "iframe not found"});
        }
      }
      
      return true;
    }

    public async run(){
      this.registerConversationHooks();

      const swCtx = { listener: this.listener.bind(this) };
      await registerEditionEarly(swCtx);

      getContext().browser.runtime.onMessage.addListener(this.listener.bind(this));
      // 在新标签页中打开扩展程序页面
      getContext().browser.runtime.onInstalled.addListener(async ({reason}: { reason: string }) => {
        console.log("onInstalled================", reason);
        if (reason === 'install') {
          this.showSidePanel = false;
          await Storage.init().set("doma_agent_side_pannel_status", false);
        }
      });

      await initEditionBackground(swCtx);

      await this.setGlobalSidePanelEnabled(true);

      registerScheduledAlarmsListener();

      getContext().browser.action.onClicked.addListener((tab: any) => {
        console.log("panel----", this.showSidePanel);
        const browser = getContext().browser as any;
        if (!browser.sidePanel?.setOptions) return;
        if (this.showSidePanel) {
          browser.sidePanel.setOptions({
            path: SIDE_PANEL_PATH,
            enabled: false,
          });
          this.showSidePanel = false;
          void Storage.init().set("doma_agent_side_pannel_status", false);
        } else {
          browser.sidePanel.setOptions({
            path: SIDE_PANEL_PATH,
            enabled: true,
          });
          const windowId = tab?.windowId;
          if (windowId != null && browser.sidePanel.open) {
            void browser.sidePanel.open({ windowId });
          }
          this.showSidePanel = true;
          void Storage.init().set("doma_agent_side_pannel_status", true);
        }
      });

      getContext().browser.sidePanel.onClosed.addListener(()=>{
        this.showSidePanel = false;
        void Storage.init().set("doma_agent_side_pannel_status", false);
      })
      getContext().browser.sidePanel.onOpened.addListener(()=>{
        this.showSidePanel = true;
        void Storage.init().set("doma_agent_side_pannel_status", true);
      })

      getContext().browser.webNavigation.onBeforeNavigate.addListener((detail: any)=>{
        if(detail){
          if(detail.frameType != "outermost_frame" && detail.frameId >= 0 ){
            const iframeInfo = {
              frameId: detail.frameId,
              frameType: detail.frameType,
              parentFrameId: detail.parentFrameId,
              url: detail.url
            }
            if(this.iframeMap.has(detail.tabId)){
              this.iframeMap.get(detail.tabId).push(iframeInfo);
            }else{
              this.iframeMap.set(detail.tabId, [iframeInfo]);
            }
          }

          if (detail.frameId == 0){
            const instruction = extractUseCaseInstructionFromUrl(detail.url);
            if (instruction) {
              relayUseCaseInstructionToSidePanel({
                instruction,
                tabId: detail.tabId,
                url: detail.url,
              });
            }
          }
        }
      }, {urls: ["<all_urls>"]});

      registerEditionTabListeners();
    }
}

function decodeBase64Utf8(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractUseCaseInstructionFromUrl(url: string): string | undefined {
  const marker = "use-case?instruction=";
  const idx = url.indexOf(marker);
  if (idx < 0) return undefined;

  let raw = url.slice(idx + marker.length);
  const amp = raw.indexOf("&");
  if (amp >= 0) raw = raw.slice(0, amp);
  const hash = raw.indexOf("#");
  if (hash >= 0) raw = raw.slice(0, hash);
  raw = decodeURIComponent(raw.trim());
  if (!raw) return undefined;

  try {
    return decodeBase64Utf8(raw);
  } catch (e) {
    console.warn("[SW] use-case instruction base64 decode failed", e);
    return undefined;
  }
}

function relayUseCaseInstructionToSidePanel(payload: {
  instruction: string;
  tabId: number;
  url: string;
}): void {
  queueMicrotask(() => {
    try {
      getContext().browser.runtime
        .sendMessage({
          origin: "background",
          operate: "chat/useCaseInstruction",
          instruction: payload.instruction,
          tabId: payload.tabId,
          url: payload.url,
        })
        .catch(() => {
          // 侧栏未打开时忽略
        });
    } catch {
      // ignore
    }
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
      
  

const background = new Background();

void bootstrapEdition().then(() => {
  background.run();
});



