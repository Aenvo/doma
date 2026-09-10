import type { ComputedRef, Ref } from "vue";
import type {
  CopySelectionChipItem,
  CopySelectionChipPayload,
  CopySelectionAnchor,
  PageElementsPayload,
  PrimarySubjectType,
} from '../chatTypes';

export type ComposerMode = "dock" | "inline";

export type CommandChipItem = {
  id: string;
  commandId: string;
};

export type SkillChipItem = {
  id: string;
  skillId: string;
};

/** 引用历史用户气泡：协议只存 quotedMsgId；label 仅 composer 展示 */
export type QuoteChipItem = {
  id: string;
  quotedMsgId: string;
  label: string;
};

export type ComposerSendPayload = {
  rawText: string;
  segments: import("../types").UserMessageSegment[];
  commandIds: string[];
  skillIds: string[];
  tabMentions: Array<{
    tabId?: number;
    title: string;
    url: string;
    favIconUrl?: string;
  }>;
  quoteMsgIds: string[];
};

export type TabChipItem = {
  id: string;
  tabId?: number;
  title: string;
  url: string;
  favIconUrl?: string;
};

export type TabMentionMenuViewItem = {
  tabId?: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active?: boolean;
  windowId?: number;
};

export type TabUrlSelectPayload = {
  url: string;
  title: string;
};

export type TabMentionSelectPayload = TabMentionMenuViewItem;

export type TabMentionSendPayload = Omit<TabChipItem, "id">;

export type SlashCommandMenuViewItem = {
  id: string;
  label: string;
  description: string;
  /** 斜杠调用的 skill 名称（仅 skill 条目） */
  skillName?: string;
  builtin?: boolean;
  editable?: boolean;
};

export type AttachedFileItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  status: "loading" | "ready" | "error";
  previewUrl?: string;
};

export type AttachedFilePreviewPayload = {
  id: string;
  previewUrl: string;
  name: string;
};

export interface UseChatComposerOptions {
  mode?: ComposerMode;
  loading: Ref<boolean>;
  conversationId: Ref<string | null | undefined>;
  scopeActive: Ref<boolean>;
  pendingCopySelectionFromPage: Ref<CopySelectionChipPayload | null>;
  placeholder: ComputedRef<string>;
  onScopeToggle: () => void;
  onChipScrollToPage: (chip: CopySelectionChipItem) => void;
  /** 点击引用 chip：滚到对应用户气泡 */
  onQuoteChipClick?: (quotedMsgId: string) => void;
  /** 恢复/展示引用 chip 文案（只存 id 时现场查摘要） */
  resolveQuoteChipLabel?: (quotedMsgId: string) => string;
  /** 发送新消息（dock / inline 均为新增，不覆盖历史） */
  onSend: (payload: ComposerSendPayload) => void | Promise<void>;
  /** 存在 command chip 时优先调用；commandId 为斜杠命令名 */
  onCommandSend?: (commandId: string, payload: ComposerSendPayload) => void | Promise<void>;
  /** 存在 skill chip 时优先调用；skillId 为斜杠 Skill 名 */
  onSkillSend?: (skillId: string, payload: ComposerSendPayload) => void | Promise<void>;
  /** 存在 tab chip 时调用；tab 含 tabId / title / url 等 */
  onTabSend?: (tab: TabMentionSendPayload, payload: ComposerSendPayload) => void | Promise<void>;
  /** 存在 command / skill / tab chip 时按 segments 顺序组装并发送（可与多种 chip 共存）
   * 返回 false 表示已拦截（如打开确认弹框），不要清空 composer
   */
  onStructuredSend?: (payload: ComposerSendPayload) => void | boolean | Promise<void | boolean>;
  onEnqueue?: (rawText: string) => void;
  onStop?: () => void;
}

export type ChatComposerBinding = {
  mode: ComposerMode;
  attachedFiles: AttachedFileItem[];
  composerDataEmpty: boolean;
  hasPendingUploadFiles: boolean;
  canEnqueue: boolean;
  loading: boolean;
  scopeActive: boolean;
  placeholder: string;
  composerContentEditable: string;
  onRemoveAttachedFile: (id: string) => void;
  onPreviewAttachedFile?: (file: AttachedFilePreviewPayload) => void;
  onComposerKeydown: (e: KeyboardEvent) => void;
  onComposerPaste: (e: ClipboardEvent) => void;
  onComposerInput: () => void;
  onComposerClick: (e: MouseEvent) => void;
  onComposerDragEnter: (e: DragEvent) => void;
  onComposerDragOver: (e: DragEvent) => void;
  onComposerDragLeave: () => void;
  onComposerDrop: (e: DragEvent) => void;
  onAttachFileClick: () => void;
  onAttachFileChange: (e: Event) => void;
  onWorkspaceClick: () => void;
  onScopeToggle: () => void;
  onSendClick: () => void;
  onLoadingControlClick: () => void;
  canSend: boolean;
  conversationId?: string | null;
  /** Open 版：Agent 旁显示模型按钮 */
  showModelPicker?: boolean;
  modelButtonLabel?: string;
  onModelButtonClick?: () => void;
  slashCommandMenu?: {
    visible: boolean;
    skillTitle: string;
    commandTitle: string;
    emptyText?: string;
    skillItems: SlashCommandMenuViewItem[];
    commandItems: SlashCommandMenuViewItem[];
    query: string;
    activeIndex: number;
    scrollActiveTick?: number;
    onSelect: (payload: { id: string; kind: "skill" | "command" }) => void;
    onHoverIndex?: (index: number) => void;
    addSkillLabel?: string;
    addSkillFooterIndex?: number;
    builtinBadgeLabel?: string;
    editSkillLabel?: string;
    onAddSkill?: () => void;
    onEditSkill?: (skillId: string) => void;
  };
  tabMentionMenu?: {
    visible: boolean;
    menuTitle: string;
    emptyText?: string;
    emptyTitleLabel?: string;
    emptyUrlLabel?: string;
    newTabPlaceholder?: string;
    newTabConfirmLabel?: string;
    historyTitle?: string;
    items: TabMentionMenuViewItem[];
    query: string;
    activeIndex: number;
    scrollActiveTick?: number;
    onSelect: (item: TabMentionMenuViewItem) => void;
    onSelectUrl?: (payload: TabUrlSelectPayload) => void;
    onHoverIndex?: (index: number) => void;
  };
  addSkillDialog?: {
    visible: boolean;
    mode?: "create" | "edit";
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    allowModelRouteLabel: string;
    descriptionLabel?: string;
    descriptionPlaceholder?: string;
    bodyLabel: string;
    cancelText: string;
    saveText: string;
    savingText: string;
    deleteText?: string;
    deletingText?: string;
    exportText?: string;
    exportingText?: string;
    saving: boolean;
    deleting?: boolean;
    exporting?: boolean;
    submitError: string;
    initialName?: string;
    initialAllowModelRoute?: boolean;
    initialDescription?: string;
    initialBody?: string;
    onCancel: () => void;
    onSave: (payload: {
      name: string;
      allowModelRoute: boolean;
      description: string;
      body: string;
    }) => void;
    onDelete?: () => void;
    onExport?: (payload: {
      name: string;
      allowModelRoute: boolean;
      description: string;
      body: string;
    }) => void;
  };
};
