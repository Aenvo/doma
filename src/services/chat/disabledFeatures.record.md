# 暂时禁用的 Chat 能力

> 恢复时按下列文件逐项还原；勿删除 `ToolThinking.vue` 与 `browser_skill_background_browse` 实现，仅断开注册与 UI 接线。

## 1. `browser_skill_background_browse`（后台自主浏览）

**禁用时间：** 2026-06-18

**原因：** 后台 inactive tab 截图/content script 注入在折叠组等场景下不稳定，先下线工具暴露，待截图与 relay 方案稳定后再开。

**已改动：**

| 文件 | 改动 |
|------|------|
| `src/services/chat/llm/toolsDefinition.ts` | 从 `BROWSER_TOOLS` 移除工具定义 |
| `src/services/chat/llm/llmTypes.ts` | 注释「后台探索浏览」技能说明 |
| `src/services/chat/browserTools.ts` | 注释 `browser_skill_background_browse` / `buildBackgroundBrowsePrompt` / `newThinkId`，并从 `TOOL_HANDLERS` 注销 |

**保留未删（恢复时直接接回）：**

- `browserTools.ts` 内 `browser_skill_background_browse` 函数体（块注释）
- `ChatPanel.vue` 内 `runBackgroundConversationIfNeeded` / `chat/runTabBackground` 消息处理（无 THINKING 时仍可用于其它入口）

---

## 2. `ToolThinking`（THINKING 卡片 UI + relay 增量）

**禁用时间：** 2026-06-18

**原因：** 与 `browser_skill_background_browse` 配套；工具下线后 THINKING 卡片无来源，暂时移除侧栏接线。

**已改动：**

| 文件 | 改动 |
|------|------|
| `src/components/chat/CustomUIRenderer.vue` | 移除 `ToolThinking` 渲染分支 |
| `src/components/chat/ChatPanel.vue` | 移除 `patchThinkingByThinkId`、`handleThinkingStop`、`chat/toolThinking` 监听、`buildCustomUI` THINKING 分支、tool 回调 thinkId 分支、`addMessage` relay→THINKING 增量 |

**保留未删（恢复时直接接回）：**

- `src/components/chat/ToolThinking.vue`
- `src/components/chat/chatTypes.ts` 中 `THINKING` / `ThinkingPayload`
- `conversationContextStore` 中 `thinkId` 字段

---

## 恢复检查清单

- [ ] `toolsDefinition.ts` 加回 `browser_skill_background_browse`
- [ ] `types.ts` 加回技能 prompt 段落
- [ ] `browserTools.ts` 取消注释并重新注册 `TOOL_HANDLERS`
- [ ] `CustomUIRenderer.vue` 接回 `ToolThinking`
- [ ] `ChatPanel.vue` 接回 THINKING 相关函数与消息分支
- [ ] 验证后台 tab 截图路径（inactive / 折叠组）后再对外暴露工具
