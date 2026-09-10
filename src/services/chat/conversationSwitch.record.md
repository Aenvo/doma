# Chat 会话切换 / 面板绑定 — 修改日志

> 与 `.cursor/rules/chat-conversation-switch.mdc` 配套；改切 tab / `loadConversation` / 面板 cid 前先读规则。

## 2026-07-28 — liveMessageDrafts：切 tab 后流式仍累加落盘

**动机：** 去掉 loading pin 后，切走面板会替换 `messages`；后续 SSE chunk 走 `addMessage(短文本)+put` 覆盖 IDB。

**改动：**
- `liveMessageDrafts`（msgId → { convId, msg }）为流式权威状态
- `upsertAssistantMessage` 只更新 draft；面板绑定则同步同一对象引用
- `persistMessageNow` / `queueMessagePersist` 从 draft 取全文与 convId
- `loadConversation` 切走前 flush drafts；切入时 `mergeLiveDraftsIntoMessages`
- `onConversationDone` 后 `clearLiveMessageDraftsForConversation`

---

## 2026-07-28 — 移除 loading pin（观察定时 / MCP）

**动机：** loading pin 会挡住用户手动切 tab；MCP 与定时均已走 `startGroupSession`，应用更窄手段处理「未绑定新 tab → 清空 UI」竞态。

**改动：**
- 删除 `onActivated` 的 `skip-panel-loading`
- 删除 `loadConversation` 的 `skip-clear-during-loading` / `skip-during-loading`
- 删除 `loadBoundConversation` 的 loading early-return
- **保留** `chat/suppressTabBind`（截图 brief-activate）

---

## 2026-07-27 — 定时不进 history；结束后关 group

**改动：**
- `chat.scheduled.empty` 文案改为右击发送按钮提示
- history / conversation picker 过滤 `scheduled === true`
- `recordScheduledRunResult` finally → `cleanupScheduledConversation`：仅 `ctx.scheduled === true` 时关 `groupTabs`、删 chatStorage、清 context / 面板

---

## 2026-07-27 — 定时改前台，移除 background 会话语义

**动机：** 后台定时路径（`background` / inactive tab / content 截图 timeout → brief-activate）导致面板串台与截图不稳定；改为与普通组会话相同的前台执行。

**改动：**

| 文件 | 改动 |
|------|------|
| `conversationContextStore.ts` | 删除 `ConversationContext.background` 及 upsert 透传 |
| `ChatPanel.vue` | `startGroupSession()` 无参，始终 `active:true` + 绑面板；定时 fire 用 `startGroupSession()` + `send2`（无 `background`）；删除 `Send2Options.background` |
| `browserTools.ts` | `browser_navigate` 不再读 `conversation.background` 强制 `active:false` |

**保留：** `chat/suppressTabBind`（截图 brief-activate 仍可能触发）；`onUpdated.groupId` 的 `tab.active` 门闩。

---

## 2026-07-27 — 截图 brief-activate 抢绑空面板（日志定位后修复）

**日志证据：**
1. `scheduledFire` / `addMessage:skip-ui`：面板 `panelCid: undefined`，定时消息正确未渲染
2. `screenshot:brief-activate` 激活后台 tab
3. `onActivated:bind`：`pinnedCid: undefined` → loading 保护不生效 → `loadConversation(定时会话)`
4. restore 后 `onActivated:skip-panel-loading` 卡住

**改动：** `suppressTabActivatedBindDepth` + `chat/suppressTabBind`；brief-activate 期间禁止 `onActivated` 绑面板。

---

## 2026-07-27 — 诊断日志（`[DOMA_BIND]` / `[DOMA_PAGE]`）

过滤：`DOMA_BIND|DOMA_PAGE`。

---

## 2026-07-27 — 未激活入组 tab 不抢面板

`handleTabUpdated`：`groupId >= 0` 仅 `tab.active` 时 `loadConversation`。
