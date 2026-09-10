<p align="right">中文 | <a href="CONTRIBUTING.md">EN</a></p>

# 贡献指南

用 AI coding agent 协助开发时，可先让它阅读 [`AGENTS.md`](./AGENTS.md)（工程约定与踩坑经验），再按下面的入口改代码。

## 主要修改入口

| 文件 | 说明 |
| --- | --- |
| [`llmTypes.ts`](./src/services/chat/llm/llmTypes.ts) | 定义 DomA 的 System Prompt，描述能力边界与行为规范；需要修改全局定位和规则时可改这里 |
| [`toolsDefinition.ts`](./src/services/chat/llm/toolsDefinition.ts) | 定义 DomA 的工具描述；需要添加工具时可改这里 |
| [`browserTools.ts`](./src/services/chat/browserTools.ts) | DomA 工具的具体实现；在 `toolsDefinition.ts` 中添加工具描述后，在这里实现逻辑 |
| [`llmService.ts`](./src/services/chat/llm/llmService.ts) | 若要支持其他模型提供商，可继承该类，并在 [`entry.ts`](./src/services/chat/llm/entry.ts) 中注册新的服务 |
| [`ChatPanel.vue`](./src/components/chat/ChatPanel.vue) | 侧边栏 UI 主入口；调整侧边栏样式可改这里 |
| [`AssistantMessageContent.vue`](./src/components/chat/AssistantMessageContent.vue) | 对话框消息内容渲染；调整消息内容样式可改这里 |
