import { getContext } from "../Context";
import {
  getEditionSlashCommands,
  getEditionSlashCommandSendSpecs,
} from "@/services/chat/editionToolHandlers";

export type SlashCommandDef = {
  id: string;
  descriptionKey: string;
};

const INTERACTION_BLOCK_PRIORITY_HINT = "# 最优先使用以下上下文";

type SlashCommandSendSpec = {
  toolName: string;
  hints: string[];
};

function formatSlashCommandToolInput(toolName: string, argsHint?: string): string {
  if (argsHint) {
    return `<toolInput>\n  <name>${toolName}</name>\n  ${argsHint}\n</toolInput>`;
  }
  return `<toolInput>\n  <name>${toolName}</name>\n</toolInput>`;
}

function wrapSlashCommandInteractionBlock(commandId: string, spec: SlashCommandSendSpec): string {
  const lines = [
    INTERACTION_BLOCK_PRIORITY_HINT,
    ...spec.hints,
    `<command>${commandId}</command>`,
    formatSlashCommandToolInput(spec.toolName),
  ];
  return `<interactionBlock>\n${lines.join("\n")}\n</interactionBlock>`;
}

/** 将 command 包进 interactionBlock，trailing 为去掉 command 后的其余消息片段序列化结果 */
export function buildSlashCommandSendText(commandId: string, trailing: string): string {
  const spec = getEditionSlashCommandSendSpecs()[commandId];
  if (!spec) {
    return `<interactionBlock>\n<command>${commandId}</command>\n</interactionBlock>${trailing}`;
  }
  return `${wrapSlashCommandInteractionBlock(commandId, spec)}${trailing}`;
}

export async function fetchSlashCommands(): Promise<SlashCommandDef[]> {
  const fallback: SlashCommandDef[] = [...getEditionSlashCommands()];
  try {
    const res = (await getContext().browser.runtime.sendMessage({
      operate: "chat/getCommands",
    })) as { success?: boolean; commands?: SlashCommandDef[] } | undefined;
    if (res?.success && Array.isArray(res.commands) && res.commands.length) {
      return res.commands.filter(
        (c) => typeof c.id === "string" && c.id.trim() && typeof c.descriptionKey === "string",
      );
    }
  } catch {
    // background unavailable
  }
  return fallback;
}

export function slashCommandLabel(id: string): string {
  return id.startsWith("/") ? id : `/${id}`;
}
