<p align="right"><a href="CONTRIBUTING-ZH.md">中文</a> | EN</p>

# Contributing Guide

When using an AI coding agent, point it at [`AGENTS.md`](./AGENTS.md) first (project conventions and hard-won pitfalls), then follow the entry points below.

## Main entry points

| File | Description |
| --- | --- |
| [`llmTypes.ts`](./src/services/chat/llm/llmTypes.ts) | Defines DomA’s System Prompt — capability boundaries and behavior rules. Change this when adjusting global positioning or policies. |
| [`toolsDefinition.ts`](./src/services/chat/llm/toolsDefinition.ts) | Tool descriptions for DomA. Change this when adding tools. |
| [`browserTools.ts`](./src/services/chat/browserTools.ts) | Concrete tool implementations. After adding a tool description in `toolsDefinition.ts`, implement the logic here. |
| [`llmService.ts`](./src/services/chat/llm/llmService.ts) | To support another model provider, subclass this and register the new service in [`entry.ts`](./src/services/chat/llm/entry.ts). |
| [`ChatPanel.vue`](./src/components/chat/ChatPanel.vue) | Main sidebar UI entry. Change this when adjusting sidebar layout or styles. |
| [`AssistantMessageContent.vue`](./src/components/chat/AssistantMessageContent.vue) | Renders assistant message content. Change this when adjusting message content styles. |
