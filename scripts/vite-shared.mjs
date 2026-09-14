import { resolve } from 'path';

/** open | pro — used by edition* vite aliases */
export function getBuildEdition(env = process.env) {
  return env.VITE_BUILD_EDITION === 'open' ? 'open' : 'pro';
}

export function getEditionBootstrapPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/edition/editionBootstrap.open.ts')
    : resolve(rootDir, 'src/edition/editionBootstrap.pro.ts');
}

export function getEditionSwHooksPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/edition/editionSwHooks.open.ts')
    : resolve(rootDir, 'src/edition/editionSwHooks.pro.ts');
}

export function getLlmEntryPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/llm/entry.open.ts')
    : resolve(rootDir, 'src/services/chat/llm/entry.pro.ts');
}

export function getSendEditionPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/sendEdition.open.ts')
    : resolve(rootDir, 'src/services/chat/sendEdition.pro.ts');
}

export function getProUpgradeModalPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/proUpgradeModal.open.ts')
    : resolve(rootDir, 'src/services/chat/proUpgradeModal.pro.ts');
}

export function getEditionToolDefsPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/llm/editionToolDefs.open.ts')
    : resolve(rootDir, 'src/services/chat/llm/editionToolDefs.pro.ts');
}

export function getEditionSystemPromptPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/llm/editionSystemPrompt.open.ts')
    : resolve(rootDir, 'src/services/chat/llm/editionSystemPrompt.pro.ts');
}

export function getEditionToolHandlersPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/services/chat/editionToolHandlers.open.ts')
    : resolve(rootDir, 'src/services/chat/editionToolHandlers.pro.ts');
}

export function getChatPanelSlotsPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/components/chat/ChatPanelSlots.open.vue')
    : resolve(rootDir, 'src/components/chat/ChatPanelSlots.pro.vue');
}

export function getChatPanelProBridgePath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/edition/chatPanelProBridge.open.ts')
    : resolve(rootDir, 'src/edition/chatPanelProBridge.pro.ts');
}

export function getPopupVideoDemoPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/edition/popupVideoDemo.open.ts')
    : resolve(rootDir, 'src/edition/popupVideoDemo.pro.ts');
}

export function getActiveBrowserTabPath(rootDir, env = process.env) {
  const edition = getBuildEdition(env);
  return edition === 'open'
    ? resolve(rootDir, 'src/edition/activeBrowserTab.open.ts')
    : resolve(rootDir, 'src/edition/activeBrowserTab.pro.ts');
}

/**
 * IDE / tsc paths：与 getViteAliases 同一套 edition 模块，随 VITE_BUILD_EDITION 切换。
 * 由 scripts/sync-edition-tsconfig.mjs 写入 tsconfig.edition.json。
 */
export function getEditionTsconfigPaths(env = process.env) {
  const edition = getBuildEdition(env);
  return {
    '@/edition/editionBootstrap': [`src/edition/editionBootstrap.${edition}.ts`],
    '@/edition/editionSwHooks': [`src/edition/editionSwHooks.${edition}.ts`],
    '@/services/chat/llm/entry': [`src/services/chat/llm/entry.${edition}.ts`],
    '@/services/chat/llm/editionToolDefs': [
      `src/services/chat/llm/editionToolDefs.${edition}.ts`,
    ],
    '@/services/chat/llm/editionSystemPrompt': [
      `src/services/chat/llm/editionSystemPrompt.${edition}.ts`,
    ],
    '@/services/chat/sendEdition': [`src/services/chat/sendEdition.${edition}.ts`],
    '@/services/chat/proUpgradeModal': [
      `src/services/chat/proUpgradeModal.${edition}.ts`,
    ],
    '@/services/chat/editionToolHandlers': [
      `src/services/chat/editionToolHandlers.${edition}.ts`,
    ],
    '@/components/chat/ChatPanelSlots': [
      `src/components/chat/ChatPanelSlots.${edition}.vue`,
    ],
    '@/edition/chatPanelProBridge': [
      `src/edition/chatPanelProBridge.${edition}.ts`,
    ],
    '@/edition/popupVideoDemo': [`src/edition/popupVideoDemo.${edition}.ts`],
    '@/edition/activeBrowserTab': [
      `src/edition/activeBrowserTab.${edition}.ts`,
    ],
    '@doma/pro/*': ['packages/pro/src/*'],
    '@/*': ['src/*'],
  };
}

export function getViteAliases(rootDir, env = process.env) {
  // 必须把精确路径放在 `@` 之前，否则 `@/xxx` 会被 `@` → src/xxx 吃掉，llm/entry 会落到 entry.ts→pro
  return [
    {
      find: '@/services/chat/llm/entry',
      replacement: getLlmEntryPath(rootDir, env),
    },
    {
      find: '@/services/chat/llm/editionToolDefs',
      replacement: getEditionToolDefsPath(rootDir, env),
    },
    {
      find: '@/services/chat/llm/editionSystemPrompt',
      replacement: getEditionSystemPromptPath(rootDir, env),
    },
    {
      find: '@/services/chat/sendEdition',
      replacement: getSendEditionPath(rootDir, env),
    },
    {
      find: '@/services/chat/proUpgradeModal',
      replacement: getProUpgradeModalPath(rootDir, env),
    },
    {
      find: '@/services/chat/editionToolHandlers',
      replacement: getEditionToolHandlersPath(rootDir, env),
    },
    {
      find: '@/components/chat/ChatPanelSlots',
      replacement: getChatPanelSlotsPath(rootDir, env),
    },
    {
      find: '@/edition/editionBootstrap',
      replacement: getEditionBootstrapPath(rootDir, env),
    },
    {
      find: '@/edition/editionSwHooks',
      replacement: getEditionSwHooksPath(rootDir, env),
    },
    {
      find: '@/edition/chatPanelProBridge',
      replacement: getChatPanelProBridgePath(rootDir, env),
    },
    {
      find: '@/edition/popupVideoDemo',
      replacement: getPopupVideoDemoPath(rootDir, env),
    },
    {
      find: '@/edition/activeBrowserTab',
      replacement: getActiveBrowserTabPath(rootDir, env),
    },
    // Pro-only implementation tree (Open must not import via shared UI without edition bridge)
    { find: '@doma/pro', replacement: resolve(rootDir, 'packages/pro/src') },
    { find: '@', replacement: resolve(rootDir, 'src') },
    { find: '~', replacement: resolve(rootDir, 'src') },
  ];
}
