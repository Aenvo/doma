import type {
  EditionSlashCommandDef,
  EditionSlashCommandSendSpec,
  EditionToolHandlerDeps,
  ToolHandler,
} from './editionToolHandlerTypes';

/** Open 插槽：无版别附加 handlers / 斜杠命令 */
export function getEditionToolHandlers(_deps?: EditionToolHandlerDeps): Record<string, ToolHandler> {
  return {};
}

export function getEditionSlashCommands(): EditionSlashCommandDef[] {
  return [];
}

export function getEditionSlashCommandSendSpecs(): Record<string, EditionSlashCommandSendSpec> {
  return {};
}
