export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export type EditionToolHandlerDeps = {
  getTabIdByConversationId: (conversationId: string) => Promise<number | undefined>;
};

export type EditionSlashCommandDef = {
  id: string;
  descriptionKey: string;
};

export type EditionSlashCommandSendSpec = {
  toolName: string;
  hints: string[];
};
