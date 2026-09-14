import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getContext } from "@/services/Context";
import { openWorkspaceTab } from "@/services/workspace/workspaceFs";
import { getUploadFile } from "@/services/chat/uploadFileStore";
import { fetchSlashCommands, slashCommandLabel } from "@/services/chat/slashCommands";
import { fetchSlashSkills, slashSkillLabel } from "@/services/chat/slashSkills";
import { AgentSkillRegistry } from "@/services/chat/skills/agentSkillRegistry";
import { parseSkillDraftForForm } from "@/services/chat/skills/skillComposer";
import { downloadDomaSkillFile } from "@/services/chat/skills/exportDomaSkill";
import { filterSlashCommandItems } from "./slashCommandFilter";
import { filterTabMentionItems } from "./tabMentionFilter";
import { tabMentionUrlDisplayTitle } from "./tabMentionUrl";
import { isSpreadsheetUpload, csvBlobToStoredSheet } from "@/utils/parseUploadFileContent";
import { parseSpreadsheetFileForStorage } from "@/utils/parseSpreadsheetUpload";
import { applyFaviconToImg } from "./faviconCache";
import type {
  CopySelectionChipItem,
  CopySelectionAnchor,
  PageElementsPayload,
  PrimarySubjectBlock,
  PrimarySubjectType,
  UserAttachedFileMeta,
  UserMessageSegment,
} from '../chatTypes';
import {
  parseUserMessageSegments,
  serializeUserMessageSegments,
  formatElementsChipLabel,
  toolInputDisplayLabel,
  parseComposerPasteText,
  parseComposerPasteHtml,
  flattenElementsStruct,
  parseSourceTabId,
} from '../chatTypes';
import type {
  AttachedFileItem,
  ChatComposerBinding,
  CommandChipItem,
  SkillChipItem,
  QuoteChipItem,
  TabChipItem,
  ComposerMode,
  ComposerSendPayload,
  SlashCommandMenuViewItem,
  TabMentionMenuViewItem,
  TabUrlSelectPayload,
  UseChatComposerOptions,
} from "./types";

const INPUT_MAX_HEIGHT_PX = 300;
const INPUT_MIN_HEIGHT_PX = 36;
const COMPOSER_CONTENT_EDITABLE = "plaintext-only";

/** 绝对定位 placeholder 不参与 scrollHeight，空内容时需单独测量换行高度 */
function measureComposerPlaceholderHeight(el: HTMLElement): number {
  const placeholder = el.getAttribute("data-placeholder")?.trim();
  if (!placeholder) return INPUT_MIN_HEIGHT_PX;
  const width = el.clientWidth;
  if (width <= 0) return INPUT_MIN_HEIGHT_PX;
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.width = `${width}px`;
  mirror.style.fontSize = style.fontSize;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";
  mirror.style.overflowWrap = style.overflowWrap || "anywhere";
  mirror.style.boxSizing = "border-box";
  mirror.style.padding = "0";
  mirror.textContent = placeholder;
  el.ownerDocument.body.appendChild(mirror);
  const h = mirror.offsetHeight;
  mirror.remove();
  return h;
}

/** 最低高度：至少两行字号高度，并覆盖当前 placeholder 换行高度（发送后短 placeholder 也不回弹） */
function resolveComposerMinHeight(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 15;
  let lineHeightPx = parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
    lineHeightPx = fontSize * 1.4;
  }
  const twoLineFloor = Math.ceil(lineHeightPx * 2);
  const placeholderH = Math.ceil(measureComposerPlaceholderHeight(el));
  return Math.max(INPUT_MIN_HEIGHT_PX, twoLineFloor, placeholderH);
}
/** contenteditable 里 margin 不一定形成可感知的光标间隙；hair space（U+200A）比 thin（U+2009）更窄 */
const CHIP_AFTER_GAP = "\u200A";

function getTextBeforeCaret(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return "";
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const holder = document.createElement("div");
  holder.appendChild(pre.cloneContents());
  let out = "";
  walkComposerDomForPlainText(holder, {
    appendText: (chunk) => {
      out += chunk;
    },
    appendNewline: () => {
      out += "\n";
    },
    hasContent: () => out.length > 0,
    skipElement: (el) =>
      el.dataset.copyChipId != null
      || el.dataset.commandChipId != null
      || el.dataset.skillChipId != null
      || el.dataset.tabChipId != null,
  });
  return out.replace(/[\u200A\u2009]/g, "");
}

function endOfNodeText(node: Node): { node: Text | null; offset: number } {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node as Text;
    return { node: t, offset: t.length };
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (
      el.dataset.copyChipId != null
      || el.dataset.commandChipId != null
      || el.dataset.skillChipId != null
      || el.dataset.tabChipId != null
    ) {
      return { node: null, offset: 0 };
    }
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const r = endOfNodeText(el.childNodes[i]!);
      if (r.node) return r;
    }
  }
  return { node: null, offset: 0 };
}

function resolveTextPositionBefore(range: Range): { node: Text | null; offset: number } {
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    return { node: startContainer as Text, offset: startOffset };
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
    return endOfNodeText(startContainer.childNodes[startOffset - 1]!);
  }
  return { node: null, offset: 0 };
}

function removeCharsBeforeCaret(root: HTMLElement, count: number): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || count <= 0) return false;
  const range = sel.getRangeAt(0).cloneRange();
  if (!range.collapsed || !root.contains(range.startContainer)) return false;

  let remaining = count;
  while (remaining > 0) {
    const { node, offset } = resolveTextPositionBefore(range);
    if (!node || offset <= 0) return false;
    const take = Math.min(offset, remaining);
    node.deleteData(offset - take, take);
    range.setStart(node, offset - take);
    range.collapse(true);
    remaining -= take;
  }
  sel.removeAllRanges();
  sel.addRange(range);
  return remaining === 0;
}

function parseSlashQuery(textBefore: string): string | null {
  const m = textBefore.match(/(?:^|[\s\u200A\u2009])(\/[^\s/]*)$/);
  if (!m?.[1]) return null;
  return m[1].slice(1);
}

function slashTokenLength(textBefore: string): number {
  const m = textBefore.match(/(?:^|[\s\u200A\u2009])(\/[^\s/]*)$/);
  return m?.[1]?.length ?? 0;
}

function isAtMentionBoundaryChar(ch: string | undefined): boolean {
  if (!ch) return true;
  // 避免 email（user@domain.com）误触发；中文等可直接接 @
  return !/[a-zA-Z0-9._-]/.test(ch);
}

function parseAtMentionToken(textBefore: string): { query: string; tokenLen: number } | null {
  const at = textBefore.lastIndexOf("@");
  if (at < 0) return null;
  const token = textBefore.slice(at);
  if (!/^@[^\s@]*$/.test(token)) return null;
  if (!isAtMentionBoundaryChar(textBefore[at - 1])) return null;
  return { query: token.slice(1), tokenLen: token.length };
}

function parseAtQuery(textBefore: string): string | null {
  return parseAtMentionToken(textBefore)?.query ?? null;
}

function atTokenLength(textBefore: string): number {
  return parseAtMentionToken(textBefore)?.tokenLen ?? 0;
}

/** contenteditable 换行可能是 <br> 或块级 <div>/<p>（plaintext-only 常见） */
function walkComposerDomForPlainText(
  root: HTMLElement,
  emit: {
    appendText: (chunk: string) => void;
    appendNewline: () => void;
    skipElement?: (el: HTMLElement) => boolean;
    hasContent: () => boolean;
  },
): void {
  const walk = (n: ChildNode) => {
    if (n.nodeType === Node.TEXT_NODE) {
      emit.appendText((n as Text).data);
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    if (emit.skipElement?.(el)) return;
    const tag = el.tagName;
    if (tag === "BR") {
      emit.appendNewline();
      return;
    }
    if (tag === "P" || tag === "DIV") {
      if (emit.hasContent()) emit.appendNewline();
      el.childNodes.forEach(walk);
      return;
    }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
}

/** inline 编辑发送时去掉 contenteditable 末尾 phantom 换行，避免每次多一行 */
function stripInlineComposerTrailingNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
}

/** 将用户消息正文还原为 text/br 混排，与 buildUserMessageSegmentsFromComposer 对称 */
function appendComposerTextWithLineBreaks(root: HTMLElement, text: string): void {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return;
  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) root.appendChild(document.createElement("br"));
    if (lines[i]) root.appendChild(document.createTextNode(lines[i]));
  }
}

function isSafeHttpOrHttpsUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function useChatComposer(options: UseChatComposerOptions) {
  const {
    mode = "dock",
    loading,
    conversationId,
    scopeActive,
    pendingCopySelectionFromPage,
    placeholder,
    onScopeToggle,
    onChipScrollToPage,
    onQuoteChipClick,
    resolveQuoteChipLabel,
    onSend,
    onCommandSend,
    onSkillSend,
    onTabSend,
    onStructuredSend,
    onEnqueue,
    onStop,
  } = options;

  const { t, te } = useI18n();
  const composerEl = ref<HTMLDivElement | null>(null);
  const attachFileInputEl = ref<HTMLInputElement | null>(null);
  const inputText = ref("");
  const attachedFiles = ref<AttachedFileItem[]>([]);
  const copySelectionChips = ref<CopySelectionChipItem[]>([]);
  const commandChips = ref<CommandChipItem[]>([]);
  const skillChips = ref<SkillChipItem[]>([]);
  const tabChips = ref<TabChipItem[]>([]);
  const quoteChips = ref<QuoteChipItem[]>([]);
  const slashCommandDefs = ref<Array<{ id: string; descriptionKey: string }>>([]);
  const slashSkillDefs = ref<Array<{ id: string; name: string; descriptionKey?: string; description?: string; source?: string }>>([]);
  const slashMenuOpen = ref(false);
  const slashQuery = ref("");
  const slashActiveIndex = ref(0);
  const slashScrollActiveTick = ref(0);
  const tabMentionItems = ref<TabMentionMenuViewItem[]>([]);
  const atMenuOpen = ref(false);
  const atQuery = ref("");
  const atActiveIndex = ref(0);
  const atScrollActiveTick = ref(0);
  /** @ 菜单打开时 composer 内触发 @ 的光标位置；open tab 输入框获焦后选区会离开 composer */
  let atMenuInsertRange: Range | null = null;
  const showAddSkillDialog = ref(false);
  const addSkillSaving = ref(false);
  const addSkillDeleting = ref(false);
  const addSkillExporting = ref(false);
  const addSkillError = ref("");
  const editingSkillId = ref<string | null>(null);
  const editSkillInitial = ref({
    name: "",
    allowModelRoute: false,
    description: "",
    body: "",
  });

  function isImageUploadFile(file: File, type?: string): boolean {
    const mime = (type || file.type || "").trim().toLowerCase();
    if (mime.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|avif)$/i.test(file.name || "");
  }

  function createImagePreviewUrl(file: File, type?: string): string | undefined {
    if (!isImageUploadFile(file, type)) return undefined;
    try {
      return URL.createObjectURL(file);
    } catch {
      return undefined;
    }
  }

  function revokeAttachedFilePreview(item: Pick<AttachedFileItem, "previewUrl"> | undefined): void {
    const url = item?.previewUrl;
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  function clearAttachedFiles(): void {
    for (const f of attachedFiles.value) revokeAttachedFilePreview(f);
    attachedFiles.value = [];
  }

  function removeAttachedFile(id: string) {
    const removed = attachedFiles.value.find((f) => f.id === id);
    revokeAttachedFilePreview(removed);
    attachedFiles.value = attachedFiles.value.filter((f) => f.id !== id);
  }

  const hasPendingUploadFiles = computed(() => attachedFiles.value.some((f) => f.status !== "ready"));

  const composerDataEmpty = computed(
    () =>
      !inputText.value.trim()
      && copySelectionChips.value.length === 0
      && commandChips.value.length === 0
      && skillChips.value.length === 0
      && tabChips.value.length === 0
      && quoteChips.value.length === 0,
  );

  const canEnqueue = computed(
    () =>
      loading.value &&
      !composerDataEmpty.value &&
      !hasPendingUploadFiles.value &&
      !!conversationId.value,
  );

  const canSend = computed(() => !composerDataEmpty.value && !hasPendingUploadFiles.value);

  function newCopySelectionChipId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function copySelectionChipToPrimarySubject(chip: CopySelectionChipItem): PrimarySubjectBlock | null {
    if (chip.kind !== "elements") return null;
    const host = (chip.struct.host || "").trim();
    if (!host) return null;
    // 无 tabId / 无 selector 时仍保留 chip（气泡展示 + 文本上下文）；定位能力可能受限
    const tabId = parseSourceTabId(chip.struct.tabId);
    const hasSelectors = flattenElementsStruct(chip.struct).length > 0;
    const hasText = !!(chip.struct.text && String(chip.struct.text).trim());
    if (tabId == null && !hasSelectors && !hasText) return null;
    return {
      type: chip.subjectType,
      payload: {
        ...chip.struct,
        host,
        tabId: tabId != null ? String(tabId) : (chip.struct.tabId || "").trim() || "0",
      },
    };
  }

  function buildUserMessageSegmentsFromComposer(root: HTMLElement | null): UserMessageSegment[] {
    const segments: UserMessageSegment[] = [];

    const readyFiles = attachedFiles.value.filter((f) => f.status === "ready");
    if (readyFiles.length) {
      segments.push({
        type: "attachedFiles",
        files: readyFiles.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          lastModified: f.lastModified,
        })),
      });
    }

    if (!root) return segments;

    const byId = new Map(copySelectionChips.value.map((c) => [c.id, c] as const));
    const commandById = new Map(commandChips.value.map((c) => [c.id, c] as const));
    const skillById = new Map(skillChips.value.map((c) => [c.id, c] as const));
    const tabById = new Map(tabChips.value.map((c) => [c.id, c] as const));
    const quoteById = new Map(quoteChips.value.map((c) => [c.id, c] as const));
    let textBuf = "";
    let domContentStarted = false;
    const markDomContent = () => {
      domContentStarted = true;
    };
    const flushText = () => {
      const t = textBuf.replace(/[\u200A\u2009]/g, "");
      if (!t.trim() && !/\n/.test(t)) {
        textBuf = "";
        return;
      }
      segments.push({ type: "text", text: t });
      markDomContent();
      textBuf = "";
    };

    walkComposerDomForPlainText(root, {
      appendText: (chunk) => {
        textBuf += chunk;
        if (chunk) markDomContent();
      },
      appendNewline: () => {
        textBuf += "\n";
        markDomContent();
      },
      hasContent: () => textBuf.length > 0 || domContentStarted,
      skipElement: (el) => {
        const quoteChipId = el.dataset.quoteChipId;
        if (quoteChipId != null) {
          flushText();
          const chip = quoteById.get(quoteChipId);
          if (chip) {
            segments.push({ type: "quote", quotedMsgId: chip.quotedMsgId });
            markDomContent();
          }
          return true;
        }
        const skillChipId = el.dataset.skillChipId;
        if (skillChipId != null) {
          flushText();
          const chip = skillById.get(skillChipId);
          if (chip) {
            segments.push({ type: "skill", skillId: chip.skillId });
            markDomContent();
          }
          return true;
        }
        const commandChipId = el.dataset.commandChipId;
        if (commandChipId != null) {
          flushText();
          const chip = commandById.get(commandChipId);
          if (chip) {
            segments.push({ type: "command", commandId: chip.commandId });
            markDomContent();
          }
          return true;
        }
        const tabChipId = el.dataset.tabChipId;
        if (tabChipId != null) {
          flushText();
          const chip = tabById.get(tabChipId);
          if (chip) {
            segments.push({
              type: "tab",
              tab: {
                tabId: chip.tabId,
                title: chip.title,
                url: chip.url,
                favIconUrl: chip.favIconUrl,
              },
            });
            markDomContent();
          }
          return true;
        }
        const chipId = el.dataset.copyChipId;
        if (chipId == null) return false;
        flushText();
        const chip = byId.get(chipId);
        if (chip) {
          const block = copySelectionChipToPrimarySubject(chip);
          if (block) {
            segments.push({ type: "primarySubject", block });
            markDomContent();
          }
        }
        return true;
      },
    });
    flushText();
    return segments;
  }

  function buildComposerSendPayload(): ComposerSendPayload {
    const segments = buildUserMessageSegmentsFromComposer(composerEl.value);
    const commandIds = segments
      .filter((s): s is Extract<UserMessageSegment, { type: "command" }> => s.type === "command")
      .map((s) => s.commandId);
    const skillIds = segments
      .filter((s): s is Extract<UserMessageSegment, { type: "skill" }> => s.type === "skill")
      .map((s) => s.skillId);
    const tabMentions = segments
      .filter((s): s is Extract<UserMessageSegment, { type: "tab" }> => s.type === "tab")
      .map((s) => s.tab);
    const quoteMsgIds = segments
      .filter((s): s is Extract<UserMessageSegment, { type: "quote" }> => s.type === "quote")
      .map((s) => s.quotedMsgId);
    let rawText = serializeUserMessageSegments(segments);
    if (mode === "inline") {
      rawText = stripInlineComposerTrailingNewlines(rawText);
    }
    return {
      rawText,
      segments,
      commandIds,
      skillIds,
      tabMentions,
      quoteMsgIds,
    };
  }

  function buildMessageText(): string {
    return buildComposerSendPayload().rawText;
  }

  function ensureGapAfterChip(chipEl: HTMLElement): Text {
    const parent = chipEl.parentNode;
    if (!parent) {
      throw new Error("ensureGapAfterChip: chip must be in DOM");
    }
    const next = chipEl.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE) {
      const t = next as Text;
      if (!t.data.startsWith(CHIP_AFTER_GAP) && !/^\s/.test(t.data)) {
        t.data = `${CHIP_AFTER_GAP}${t.data}`;
      }
      return t;
    }
    const tn = document.createTextNode(CHIP_AFTER_GAP);
    parent.insertBefore(tn, next);
    return tn;
  }

  function placeCaretAfterChipGap(chipEl: HTMLElement) {
    const gapText = ensureGapAfterChip(chipEl);
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const i = gapText.data.indexOf(CHIP_AFTER_GAP);
    const after = i >= 0 ? i + CHIP_AFTER_GAP.length : 0;
    range.setStart(gapText, Math.min(after, gapText.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function placeCaretAtComposerEnd(root: HTMLElement) {
    root.focus();
    const sel = window.getSelection();
    if (!sel) return;

    if (root.childNodes.length === 0) {
      const range = document.createRange();
      range.setStart(root, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    const last = root.lastChild!;
    if (last.nodeType === Node.ELEMENT_NODE) {
      const el = last as HTMLElement;
      if (
        el.dataset.copyChipId != null
        || el.dataset.commandChipId != null
        || el.dataset.skillChipId != null
        || el.dataset.tabChipId != null
      ) {
        placeCaretAfterChipGap(el);
        return;
      }
    }

    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function extractPlainTextFromComposer(root: HTMLElement | null): string {
    if (!root) return "";
    let out = "";
    walkComposerDomForPlainText(root, {
      appendText: (chunk) => {
        out += chunk;
      },
      appendNewline: () => {
        out += "\n";
      },
      hasContent: () => out.length > 0,
      skipElement: (el) =>
        el.dataset.copyChipId != null
      || el.dataset.commandChipId != null
      || el.dataset.skillChipId != null
      || el.dataset.tabChipId != null,
    });
    return out.replace(/[\u200A\u2009]/g, "");
  }

  function syncInputTextFromComposer() {
    inputText.value = extractPlainTextFromComposer(composerEl.value);
  }

  /** contenteditable 删空后浏览器常留 <br>，placeholder 用 absolute 时光标会出现在占位符后面 */
  function normalizeEmptyComposerDom() {
    const root = composerEl.value;
    if (!root) return;
    const plain = extractPlainTextFromComposer(root).trim();
    const hasChips =
      !!root.querySelector(
        "[data-copy-chip-id], [data-command-chip-id], [data-skill-chip-id], [data-tab-chip-id], [data-quote-chip-id]",
      )
      || copySelectionChips.value.length > 0
      || commandChips.value.length > 0
      || skillChips.value.length > 0
      || tabChips.value.length > 0
      || quoteChips.value.length > 0;
    if (plain || hasChips) return;
    if (root.innerHTML === "") return;
    root.innerHTML = "";
    if (document.activeElement !== root) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(root, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function syncChipsFromDom() {
    const root = composerEl.value;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>("[data-copy-chip-id]")];
    const byId = new Map(copySelectionChips.value.map((c) => [c.id, c] as const));
    const next: CopySelectionChipItem[] = [];
    for (const el of els) {
      const id = el.dataset.copyChipId;
      const c = id ? byId.get(id) : undefined;
      if (c) next.push(c);
    }
    if (
      next.length !== copySelectionChips.value.length ||
      next.some((c, i) => c.id !== copySelectionChips.value[i]?.id)
    ) {
      copySelectionChips.value = next;
    }

    const cmdEls = [...root.querySelectorAll<HTMLElement>("[data-command-chip-id]")];
    const cmdById = new Map(commandChips.value.map((c) => [c.id, c] as const));
    const nextCmd: CommandChipItem[] = [];
    for (const el of cmdEls) {
      const id = el.dataset.commandChipId;
      const c = id ? cmdById.get(id) : undefined;
      if (c) nextCmd.push(c);
    }
    if (
      nextCmd.length !== commandChips.value.length ||
      nextCmd.some((c, i) => c.id !== commandChips.value[i]?.id)
    ) {
      commandChips.value = nextCmd;
    }

    const skillEls = [...root.querySelectorAll<HTMLElement>("[data-skill-chip-id]")];
    const skillById = new Map(skillChips.value.map((c) => [c.id, c] as const));
    const nextSkill: SkillChipItem[] = [];
    for (const el of skillEls) {
      const id = el.dataset.skillChipId;
      const c = id ? skillById.get(id) : undefined;
      if (c) nextSkill.push(c);
    }
    if (
      nextSkill.length !== skillChips.value.length ||
      nextSkill.some((c, i) => c.id !== skillChips.value[i]?.id)
    ) {
      skillChips.value = nextSkill;
    }

    const tabEls = [...root.querySelectorAll<HTMLElement>("[data-tab-chip-id]")];
    const tabById = new Map(tabChips.value.map((c) => [c.id, c] as const));
    const nextTab: TabChipItem[] = [];
    for (const el of tabEls) {
      const id = el.dataset.tabChipId;
      const c = id ? tabById.get(id) : undefined;
      if (c) nextTab.push(c);
    }
    if (
      nextTab.length !== tabChips.value.length ||
      nextTab.some((c, i) => c.id !== tabChips.value[i]?.id)
    ) {
      tabChips.value = nextTab;
    }

    const quoteEls = [...root.querySelectorAll<HTMLElement>("[data-quote-chip-id]")];
    const quoteById = new Map(quoteChips.value.map((c) => [c.id, c] as const));
    const nextQuote: QuoteChipItem[] = [];
    for (const el of quoteEls) {
      const id = el.dataset.quoteChipId;
      const c = id ? quoteById.get(id) : undefined;
      if (c) nextQuote.push(c);
    }
    if (
      nextQuote.length !== quoteChips.value.length ||
      nextQuote.some((c, i) => c.id !== quoteChips.value[i]?.id)
    ) {
      quoteChips.value = nextQuote;
    }
  }

  function onCopySelectionFaviconError(e: Event) {
    const img = e.target as HTMLImageElement | null;
    if (img) img.style.display = "none";
  }

  function mountChipFavicon(leading: HTMLElement, fav: string | undefined): void {
    if (!fav || !isSafeHttpOrHttpsUrl(fav)) return;
    const img = document.createElement("img");
    img.className = "copy-selection-chip-favicon";
    img.alt = "";
    img.width = 12;
    img.height = 12;
    img.decoding = "async";
    img.style.width = "12px";
    img.style.height = "12px";
    img.style.maxWidth = "12px";
    img.style.maxHeight = "12px";
    img.style.objectFit = "contain";
    img.style.display = "block";
    img.addEventListener("error", onCopySelectionFaviconError);
    leading.appendChild(img);
    applyFaviconToImg(img, fav.trim());
  }

  /** contenteditable 输入时可能重建 chip；用 data-favicon-http 把已缓存 blob 补回，避免反复打网 */
  function hydrateComposerChipFavicons(): void {
    const root = composerEl.value;
    if (!root) return;
    root.querySelectorAll<HTMLImageElement>("img[data-favicon-http]").forEach((img) => {
      const httpUrl = img.dataset.faviconHttp?.trim();
      if (!httpUrl || !isSafeHttpOrHttpsUrl(httpUrl)) return;
      applyFaviconToImg(img, httpUrl);
    });
  }

  function createChipElement(chip: CopySelectionChipItem): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "composer-chip copy-selection-chip copy-selection-chip--inline";
    wrap.setAttribute("data-copy-chip-id", chip.id);
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "status");
    const leading = document.createElement("span");
    leading.className = "copy-selection-chip-leading";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-selection-chip-dismiss";
    btn.setAttribute("data-copy-chip-dismiss", "1");
    btn.setAttribute("aria-label", "移除引用");
    btn.textContent = "×";
    leading.appendChild(btn);
    mountChipFavicon(leading, chip.struct.favicon);
    const label = document.createElement("span");
    label.className = "copy-selection-chip-text";
    label.textContent = formatElementsChipLabel(chip.struct);
    wrap.appendChild(leading);
    wrap.appendChild(label);
    return wrap;
  }

  function createCommandChipElement(chip: CommandChipItem): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "composer-chip slash-command-chip slash-command-chip--inline";
    wrap.setAttribute("data-command-chip-id", chip.id);
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "status");
    const leading = document.createElement("span");
    leading.className = "slash-command-chip-leading";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slash-command-chip-dismiss";
    btn.setAttribute("data-command-chip-dismiss", "1");
    btn.setAttribute("aria-label", "移除命令");
    btn.textContent = "×";
    leading.appendChild(btn);
    const label = document.createElement("span");
    label.className = "slash-command-chip-text";
    label.textContent = slashCommandLabel(chip.commandId);
    wrap.appendChild(leading);
    wrap.appendChild(label);
    return wrap;
  }

  function createTabChipElement(chip: TabChipItem): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "composer-chip copy-selection-chip copy-selection-chip--inline tab-mention-chip";
    wrap.setAttribute("data-tab-chip-id", chip.id);
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "status");
    const leading = document.createElement("span");
    leading.className = "copy-selection-chip-leading";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-selection-chip-dismiss";
    btn.setAttribute("data-tab-chip-dismiss", "1");
    btn.setAttribute("aria-label", "移除标签页");
    btn.textContent = "×";
    leading.appendChild(btn);
    mountChipFavicon(leading, chip.favIconUrl);
    const label = document.createElement("span");
    label.className = "copy-selection-chip-text";
    label.textContent = chip.title.trim() || chip.url.trim() || (chip.tabId != null ? `Tab ${chip.tabId}` : chip.url);
    wrap.appendChild(leading);
    wrap.appendChild(label);
    return wrap;
  }

  function createQuoteChipElement(chip: QuoteChipItem): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "composer-chip slash-command-chip slash-command-chip--inline quote-msg-chip";
    wrap.setAttribute("data-quote-chip-id", chip.id);
    wrap.setAttribute("data-quoted-msg-id", chip.quotedMsgId);
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "button");
    wrap.setAttribute("title", t("chat.quote.chipTitle"));
    const leading = document.createElement("span");
    leading.className = "slash-command-chip-leading";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slash-command-chip-dismiss";
    btn.setAttribute("data-quote-chip-dismiss", "1");
    btn.setAttribute("aria-label", t("chat.quote.removeChip"));
    btn.textContent = "×";
    leading.appendChild(btn);
    const label = document.createElement("span");
    label.className = "slash-command-chip-text";
    label.textContent = chip.label;
    wrap.appendChild(leading);
    wrap.appendChild(label);
    return wrap;
  }

  function createSkillChipElement(chip: SkillChipItem): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "composer-chip slash-command-chip slash-command-chip--inline";
    wrap.setAttribute("data-skill-chip-id", chip.id);
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "status");
    const leading = document.createElement("span");
    leading.className = "slash-command-chip-leading";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slash-command-chip-dismiss";
    btn.setAttribute("data-skill-chip-dismiss", "1");
    btn.setAttribute("aria-label", "移除技能");
    btn.textContent = "×";
    leading.appendChild(btn);
    const label = document.createElement("span");
    label.className = "slash-command-chip-text";
    label.textContent = slashSkillLabel(chip.skillId);
    wrap.appendChild(leading);
    wrap.appendChild(label);
    return wrap;
  }

  function removeSkillChip(id: string) {
    const root = composerEl.value;
    if (root) {
      const el = root.querySelector(`[data-skill-chip-id="${CSS.escape(id)}"]`);
      el?.remove();
    }
    skillChips.value = skillChips.value.filter((c) => c.id !== id);
    syncInputTextFromComposer();
    void nextTick(() => {
      autosizeInput();
      updateSlashMenuState();
      root?.focus();
    });
  }

  function clearSkillChips() {
    for (const chip of skillChips.value) {
      removeSkillChip(chip.id);
    }
    skillChips.value = [];
  }

  function clearSlashChips() {
    clearCommandChips();
    clearSkillChips();
  }

  function removeTabChip(id: string) {
    const root = composerEl.value;
    if (root) {
      const el = root.querySelector(`[data-tab-chip-id="${CSS.escape(id)}"]`);
      el?.remove();
    }
    tabChips.value = tabChips.value.filter((c) => c.id !== id);
    syncInputTextFromComposer();
    void nextTick(() => {
      autosizeInput();
      updateAtMenuState();
      root?.focus();
    });
  }

  function clearTabChips() {
    for (const chip of tabChips.value) {
      removeTabChip(chip.id);
    }
    tabChips.value = [];
  }

  function removeQuoteChip(id: string) {
    const root = composerEl.value;
    if (root) {
      const el = root.querySelector(`[data-quote-chip-id="${CSS.escape(id)}"]`);
      el?.remove();
    }
    quoteChips.value = quoteChips.value.filter((c) => c.id !== id);
    syncInputTextFromComposer();
    void nextTick(() => {
      autosizeInput();
      root?.focus();
    });
  }

  function clearQuoteChips() {
    for (const chip of quoteChips.value) {
      removeQuoteChip(chip.id);
    }
    quoteChips.value = [];
  }

  function insertQuoteChipAtCaret(quotedMsgId: string, label?: string) {
    const root = composerEl.value;
    const msgId = String(quotedMsgId ?? "").trim();
    if (!root || !msgId) return;
    if (quoteChips.value.some((c) => c.quotedMsgId === msgId)) {
      syncInputTextFromComposer();
      return;
    }
    const chipLabel =
      (label && label.trim())
      || resolveQuoteChipLabel?.(msgId)
      || t("chat.quote.fallbackLabel");
    const item: QuoteChipItem = {
      id: newCopySelectionChipId(),
      quotedMsgId: msgId,
      label: chipLabel,
    };
    quoteChips.value = [...quoteChips.value, item];
    const chipEl = createQuoteChipElement(item);
    insertChipElementAtCaret(root, chipEl);
    syncInputTextFromComposer();
    void nextTick(() => {
      autosizeInput();
      root.focus();
    });
  }

  function removeCommandChip(id: string) {
    const root = composerEl.value;
    if (root) {
      const el = root.querySelector(`[data-command-chip-id="${CSS.escape(id)}"]`);
      el?.remove();
    }
    commandChips.value = commandChips.value.filter((c) => c.id !== id);
    syncInputTextFromComposer();
    void nextTick(() => {
      autosizeInput();
      updateSlashMenuState();
      root?.focus();
    });
  }

  function clearCommandChips() {
    for (const chip of commandChips.value) {
      removeCommandChip(chip.id);
    }
    commandChips.value = [];
  }

  function insertCommandChipAtCaret(commandId: string) {
    const root = composerEl.value;
    if (!root) return;
    clearSlashChips();
    const item: CommandChipItem = {
      id: newCopySelectionChipId(),
      commandId,
    };
    commandChips.value = [item];
    const chipEl = createCommandChipElement(item);
    insertChipElementAtCaret(root, chipEl);
    closeSlashMenu();
    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  function insertSkillChipAtCaret(skillId: string) {
    const root = composerEl.value;
    if (!root) return;
    // skill 可多个并存；与 command 互斥（插入 skill 时清掉 command）
    clearCommandChips();
    if (skillChips.value.some((c) => c.skillId === skillId)) {
      closeSlashMenu();
      syncInputTextFromComposer();
      return;
    }
    const item: SkillChipItem = {
      id: newCopySelectionChipId(),
      skillId,
    };
    skillChips.value = [...skillChips.value, item];
    const chipEl = createSkillChipElement(item);
    insertChipElementAtCaret(root, chipEl);
    closeSlashMenu();
    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  function insertTabChipAtCaret(item: Pick<TabChipItem, "tabId" | "title" | "url" | "favIconUrl">) {
    const root = composerEl.value;
    if (!root || !item.url.trim()) return;
    // 允许多个 @tab；同一 tabId / 同一 url 不重复插入
    const isDup = tabChips.value.some((c) => {
      if (item.tabId != null && item.tabId > 0 && c.tabId === item.tabId) return true;
      if ((item.tabId == null || item.tabId <= 0) && c.url === item.url) return true;
      return false;
    });
    if (isDup) {
      closeAtMenu();
      syncInputTextFromComposer();
      return;
    }
    const chip: TabChipItem = {
      id: newCopySelectionChipId(),
      tabId: item.tabId,
      title: item.title,
      url: item.url,
      favIconUrl: item.favIconUrl,
    };
    tabChips.value = [...tabChips.value, chip];
    const chipEl = createTabChipElement(chip);
    insertChipElementAtCaret(root, chipEl);
    closeAtMenu();
    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  const slashSkillMenuItems = computed<SlashCommandMenuViewItem[]>(() =>
    slashSkillDefs.value.map((def) => ({
      id: def.id,
      skillName: def.name,
      label: slashSkillLabel(def.name),
      description: def.descriptionKey && te(def.descriptionKey)
        ? t(def.descriptionKey)
        : (def.description ?? def.descriptionKey ?? def.name),
      builtin: def.source === "builtin",
      editable: def.source === "user",
    })),
  );

  const slashCommandMenuItems = computed<SlashCommandMenuViewItem[]>(() =>
    slashCommandDefs.value.map((def) => ({
      id: def.id,
      label: slashCommandLabel(def.id),
      description: te(def.descriptionKey) ? t(def.descriptionKey) : def.descriptionKey,
    })),
  );

  const filteredSlashSkillItems = computed(() =>
    filterSlashCommandItems(slashSkillMenuItems.value, slashQuery.value),
  );

  const filteredSlashCommandItems = computed(() =>
    filterSlashCommandItems(slashCommandMenuItems.value, slashQuery.value),
  );

  const filteredSlashMenuItems = computed(() => [
    ...filteredSlashSkillItems.value,
    ...filteredSlashCommandItems.value,
  ]);

  /** 含底部「Add Skills」的可选行数 */
  const slashMenuSelectableCount = computed(() => filteredSlashMenuItems.value.length + 1);
  const slashAddSkillFooterIndex = computed(() => filteredSlashMenuItems.value.length);

  watch(slashQuery, () => {
    slashActiveIndex.value = 0;
  });

  watch(atQuery, () => {
    atActiveIndex.value = resolveAtMenuActiveIndex();
    atScrollActiveTick.value++;
  });

  function resolveAtMenuActiveIndex(): number {
    const items = filterTabMentionItems(tabMentionItems.value, atQuery.value);
    const activeIdx = items.findIndex((t) => t.active);
    return activeIdx >= 0 ? activeIdx : 0;
  }

  function closeAtMenu() {
    atMenuOpen.value = false;
    atQuery.value = "";
    atActiveIndex.value = 0;
    atMenuInsertRange = null;
  }

  function saveAtMenuInsertRange(root: HTMLElement) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !isSelectionInsideComposer(root, sel) || !sel.getRangeAt(0).collapsed) {
      return;
    }
    atMenuInsertRange = sel.getRangeAt(0).cloneRange();
  }

  function restoreAtMenuInsertRange(root: HTMLElement): boolean {
    if (!atMenuInsertRange || !root.contains(atMenuInsertRange.startContainer)) {
      return false;
    }
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(atMenuInsertRange);
    return true;
  }

  function removeAtMenuToken(root: HTMLElement): boolean {
    const tokenLen = atMenuOpen.value
      ? 1 + atQuery.value.length
      : atTokenLength(getTextBeforeCaret(root));
    if (tokenLen <= 0) return false;

    if (!restoreAtMenuInsertRange(root)) {
      root.focus();
      const sel = window.getSelection();
      if (!sel?.rangeCount || !isSelectionInsideComposer(root, sel)) {
        return false;
      }
    }
    return removeCharsBeforeCaret(root, tokenLen);
  }

  async function loadTabMentionItems() {
    try {
      const { listMentionTabs } = await import("@/edition/activeBrowserTab");
      tabMentionItems.value = await listMentionTabs();
    } catch {
      tabMentionItems.value = [];
    }
  }

  const filteredAtMenuItems = computed(() =>
    filterTabMentionItems(tabMentionItems.value, atQuery.value),
  );

  const atMenuSelectableCount = computed(
    () => filteredAtMenuItems.value.length,
  );

  function closeSlashMenu() {
    slashMenuOpen.value = false;
    slashQuery.value = "";
    slashActiveIndex.value = 0;
  }

  async function updateAtMenuState() {
    const root = composerEl.value;
    if (!root || loading.value) {
      closeAtMenu();
      return;
    }
    syncChipsFromDom();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !isSelectionInsideComposer(root, sel) || !sel.getRangeAt(0).collapsed) {
      closeAtMenu();
      return;
    }
    const readBefore = () => getTextBeforeCaret(root);
    const before = readBefore();
    // 斜杠命令优先：避免 @ 菜单盖住 Slash 菜单导致 Add Skills 等 footer 点不到
    if (slashMenuOpen.value || parseSlashQuery(before) != null) {
      closeAtMenu();
      return;
    }
    const query = parseAtQuery(before);
    if (query == null) {
      closeAtMenu();
      return;
    }
    atQuery.value = query;
    const opening = !atMenuOpen.value;
    if (opening) {
      await loadTabMentionItems();
    }
    if (slashMenuOpen.value || parseSlashQuery(readBefore()) != null) {
      closeAtMenu();
      return;
    }
    atMenuOpen.value = true;
    saveAtMenuInsertRange(root);
    atActiveIndex.value = resolveAtMenuActiveIndex();
    if (atActiveIndex.value >= atMenuSelectableCount.value) {
      atActiveIndex.value = Math.max(0, atMenuSelectableCount.value - 1);
    }
    if (opening) {
      atScrollActiveTick.value++;
    }
  }

  function updateSlashMenuState() {
    const root = composerEl.value;
    if (!root || loading.value) {
      closeSlashMenu();
      return;
    }
    syncChipsFromDom();
    // 允许多个 skill chip；已有 chip 时仍可再打 / 打开菜单追加
    const sel = window.getSelection();
    if (!sel?.rangeCount || !isSelectionInsideComposer(root, sel) || !sel.getRangeAt(0).collapsed) {
      closeSlashMenu();
      return;
    }
    const before = getTextBeforeCaret(root);
    const query = parseSlashQuery(before);
    if (query == null) {
      closeSlashMenu();
      return;
    }
    closeAtMenu();
    slashQuery.value = query;
    slashMenuOpen.value = true;
    if (slashActiveIndex.value >= slashMenuSelectableCount.value) {
      slashActiveIndex.value = Math.max(0, slashMenuSelectableCount.value - 1);
    }
  }

  function openAddSkillDialog() {
    const root = composerEl.value;
    if (root) {
      const before = getTextBeforeCaret(root);
      const tokenLen = slashTokenLength(before);
      if (tokenLen > 0) {
        removeCharsBeforeCaret(root, tokenLen);
      }
      syncInputTextFromComposer();
    }
    closeAtMenu();
    closeSlashMenu();
    editingSkillId.value = null;
    editSkillInitial.value = { name: "", allowModelRoute: false, description: "", body: "" };
    addSkillError.value = "";
    showAddSkillDialog.value = true;
  }

  function openAddSkillDialogWithBody(markdown: string) {
    closeSlashMenu();
    editingSkillId.value = null;
    addSkillError.value = "";
    editSkillInitial.value = parseSkillDraftForForm(markdown);
    showAddSkillDialog.value = true;
  }

  async function openEditSkillDialog(skillId: string) {
    addSkillError.value = "";
    editingSkillId.value = skillId;
    try {
      const res = (await getContext().browser.runtime.sendMessage({
        operate: "chat/getSkill",
        payload: { id: skillId },
      })) as {
        success?: boolean;
        skill?: { name: string; allowModelRoute: boolean; description?: string; body: string };
        error?: string;
      } | undefined;
      if (!res?.success || !res.skill) {
        addSkillError.value = res?.error ?? t("chat.skills.addDialog.loadFailed");
        editingSkillId.value = null;
        // 加载失败时保留 slash 菜单，避免「点了编辑却什么都没发生」
        return;
      }
      closeAtMenu();
      closeSlashMenu();
      editSkillInitial.value = {
        name: res.skill.name,
        allowModelRoute: res.skill.allowModelRoute,
        description: res.skill.description ?? "",
        body: res.skill.body,
      };
      showAddSkillDialog.value = true;
    } catch (e) {
      addSkillError.value = String(e);
      editingSkillId.value = null;
    }
  }

  async function saveAddSkill(payload: {
    name: string;
    allowModelRoute: boolean;
    description: string;
    body: string;
  }) {
    addSkillSaving.value = true;
    addSkillError.value = "";
    try {
      const res = (await getContext().browser.runtime.sendMessage({
        operate: "chat/saveSkill",
        payload: {
          id: editingSkillId.value ?? undefined,
          name: payload.name,
          allowModelRoute: payload.allowModelRoute,
          description: payload.description,
          body: payload.body,
        },
      })) as { success?: boolean; error?: string } | undefined;
      if (!res?.success) {
        addSkillError.value = res?.error ?? t("chat.skills.addDialog.saveFailed");
        return;
      }
      showAddSkillDialog.value = false;
      editingSkillId.value = null;
      await AgentSkillRegistry.reloadUserSkills();
      await loadSlashSkills();
    } catch (e) {
      addSkillError.value = String(e);
    } finally {
      addSkillSaving.value = false;
    }
  }

  async function exportAddSkill(payload: {
    name: string;
    allowModelRoute: boolean;
    description: string;
    body: string;
  }) {
    addSkillExporting.value = true;
    addSkillError.value = "";
    try {
      const res = await downloadDomaSkillFile(payload);
      if (!res.ok) {
        addSkillError.value = res.error || t("chat.skills.addDialog.exportFailed");
      }
    } catch (e) {
      addSkillError.value = String(e);
    } finally {
      addSkillExporting.value = false;
    }
  }

  async function deleteAddSkill() {
    const skillId = editingSkillId.value;
    if (!skillId) return;
    addSkillDeleting.value = true;
    addSkillError.value = "";
    try {
      const res = (await getContext().browser.runtime.sendMessage({
        operate: "chat/deleteSkill",
        payload: { id: skillId },
      })) as { success?: boolean; error?: string } | undefined;
      if (!res?.success) {
        addSkillError.value = res?.error ?? t("chat.skills.addDialog.deleteFailed");
        return;
      }
      showAddSkillDialog.value = false;
      editingSkillId.value = null;
      await AgentSkillRegistry.reloadUserSkills();
      await loadSlashSkills();
    } catch (e) {
      addSkillError.value = String(e);
    } finally {
      addSkillDeleting.value = false;
    }
  }

  function applyAtMenuSelection(item: TabMentionMenuViewItem) {
    const root = composerEl.value;
    if (!root) return;
    removeAtMenuToken(root);
    insertTabChipAtCaret({
      tabId: item.tabId,
      title: item.title,
      url: item.url,
      favIconUrl: item.favIconUrl,
    });
  }

  function applyUrlTabSelection(payload: TabUrlSelectPayload) {
    const root = composerEl.value;
    if (!root) return;
    removeAtMenuToken(root);
    insertTabChipAtCaret({
      title: payload.title,
      url: payload.url,
    });
  }

  function selectActiveAtMenuItem() {
    const item = filteredAtMenuItems.value[atActiveIndex.value];
    if (item) applyAtMenuSelection(item);
  }

  function applySlashMenuSelection(id: string, kind: "skill" | "command") {
    const root = composerEl.value;
    if (!root) return;
    const before = getTextBeforeCaret(root);
    const tokenLen = slashTokenLength(before);
    if (tokenLen > 0) {
      removeCharsBeforeCaret(root, tokenLen);
    }
    if (kind === "skill") {
      insertSkillChipAtCaret(id);
    } else {
      insertCommandChipAtCaret(id);
    }
  }

  function selectActiveSlashMenuItem() {
    const skillCount = filteredSlashSkillItems.value.length;
    const index = slashActiveIndex.value;
    if (index === slashAddSkillFooterIndex.value) {
      openAddSkillDialog();
      return;
    }
    if (index < skillCount) {
      const item = filteredSlashSkillItems.value[index];
      if (item) applySlashMenuSelection(item.skillName ?? item.id, "skill");
      return;
    }
    const commandItem = filteredSlashCommandItems.value[index - skillCount];
    if (commandItem) applySlashMenuSelection(commandItem.id, "command");
  }

  async function loadSlashSkills() {
    slashSkillDefs.value = await fetchSlashSkills();
  }

  async function loadSlashCommands() {
    slashCommandDefs.value = await fetchSlashCommands();
  }

  function isSelectionInsideComposer(root: HTMLElement, sel: Selection): boolean {
    const node = sel.anchorNode;
    if (!node) return false;
    const el = node.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as HTMLElement);
    return !!(el && root.contains(el));
  }

  function insertChipElementAtCaret(root: HTMLElement, chipEl: HTMLElement) {
    root.focus();
    const sel = window.getSelection();
    if (!sel) {
      root.appendChild(chipEl);
      placeCaretAfterChipGap(chipEl);
      return;
    }
    if (!sel.rangeCount || !isSelectionInsideComposer(root, sel)) {
      root.appendChild(chipEl);
      placeCaretAfterChipGap(chipEl);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chipEl);
    placeCaretAfterChipGap(chipEl);
  }

  function clearComposerDom() {
    const root = composerEl.value;
    if (!root) return;
    root.innerHTML = "";
  }

  function removeCopySelectionChip(id: string) {
    const root = composerEl.value;
    if (root) {
      const el = root.querySelector(`[data-copy-chip-id="${CSS.escape(id)}"]`);
      el?.remove();
    }
    copySelectionChips.value = copySelectionChips.value.filter((c) => c.id !== id);
    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  function newAttachedFileId(): string {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `file-${crypto.randomUUID()}`
      : `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function attachedFileDedupKey(file: File, type?: string): string {
    const mime = (type || file.type || "").trim().toLowerCase();
    if (mime.startsWith("image/")) {
      return `image|${mime}|${file.size}`;
    }
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  function extensionFromUploadMime(mime: string): string {
    const m = mime.toLowerCase();
    const map: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "image/svg+xml": ".svg",
      "image/heic": ".heic",
      "image/heif": ".heif",
      "image/avif": ".avif",
    };
    if (map[m]) return map[m];
    if (m.startsWith("image/")) {
      const sub = m.slice("image/".length).split("+")[0]?.split(";")[0] || "";
      if (!sub) return "";
      return `.${sub === "jpeg" ? "jpg" : sub}`;
    }
    return "";
  }

  function resolveUploadFileName(file: File): string {
    const raw = (file.name || "").trim();
    if (raw) return raw;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const ext = extensionFromUploadMime(file.type || "");
    return `${stamp}${ext}`;
  }

  async function readFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.onload = () => {
        const r = String(reader.result ?? "");
        const i = r.indexOf("base64,");
        resolve(i >= 0 ? r.slice(i + "base64,".length) : r);
      };
      reader.readAsDataURL(file);
    });
  }

  async function readAndStoreDroppedFiles(items: AttachedFileItem[]) {
    for (const item of items) {
      try {
        const base64 = await readFileToBase64(item.file);
        const res = await Promise.race([
          getContext().browser.runtime.sendMessage({
            origin: "sidepanel",
            operate: "chat/uploadFilesPutBase64",
            file: {
              id: item.id,
              base64,
              name: item.name,
              type: item.type || item.file.type || "",
              size: item.size,
              lastModified: item.lastModified,
            },
          }),
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("store timeout")), 15000),
          ),
        ]);
        if (!res || (res as any).ok !== true) {
          throw new Error((res as any)?.error || "store failed");
        }
        const mime = item.type || item.file.type || "";
        if (isSpreadsheetUpload(item.name, mime)) {
          try {
            const parsedSheets =
              /\.csv$/i.test(item.name) || mime.toLowerCase().includes("csv")
                ? await csvBlobToStoredSheet(item.file, "Sheet1")
                : await parseSpreadsheetFileForStorage(item.file, item.name);
            if (parsedSheets.length) {
              await getContext().browser.runtime.sendMessage({
                origin: "sidepanel",
                operate: "chat/uploadFilesPutParsed",
                id: item.id,
                parsedSheets,
              });
            }
          } catch (parseErr) {
            console.warn("[Chat][UploadFiles] parse spreadsheet failed:", parseErr);
          }
        }
        attachedFiles.value = attachedFiles.value.map((f) =>
          f.id === item.id ? { ...f, status: "ready" } : f,
        );
      } catch (e) {
        console.warn("[Chat][UploadFiles] failed:", e);
        attachedFiles.value = attachedFiles.value.map((f) =>
          f.id === item.id ? { ...f, status: "error" } : f,
        );
      }
    }
  }

  function addDroppedFiles(files: File[]) {
    if (!files.length) return;
    const exists = new Set(attachedFiles.value.map((f) => attachedFileDedupKey(f.file, f.type)));
    const next = [...attachedFiles.value];
    const newlyAdded: AttachedFileItem[] = [];
    for (const file of files) {
      const key = attachedFileDedupKey(file, file.type);
      if (exists.has(key)) continue;
      exists.add(key);
      const item: AttachedFileItem = {
        id: newAttachedFileId(),
        file,
        name: resolveUploadFileName(file),
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        status: "loading",
        previewUrl: createImagePreviewUrl(file, file.type),
      };
      next.push(item);
      newlyAdded.push(item);
    }
    attachedFiles.value = next;
    if (newlyAdded.length) {
      void readAndStoreDroppedFiles(newlyAdded);
    }
  }

  function onComposerDragEnter(e: DragEvent) {
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes("Files")) {
    }
  }

  function onComposerDragOver(e: DragEvent) {
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes("Files")) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  }

  function onComposerDragLeave() {
  }

  function onComposerDrop(e: DragEvent) {
    const list = e.dataTransfer?.files;
    if (!list || list.length === 0) return;
    addDroppedFiles(Array.from(list));
  }

  function onAttachFileClick() {
    attachFileInputEl.value?.click();
  }

  function onAttachFileChange(e: Event) {
    const input = e.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (files.length) addDroppedFiles(files);
    if (input) input.value = "";
  }

  function onWorkspaceClick() {
    try {
      // 未授权时也直接打开工作区页；必须同步调用，避免丢点击手势
      openWorkspaceTab();
    } catch (e) {
      console.warn("[workspace] open failed:", e);
    }
  }

  function insertNodeAtCaret(root: HTMLElement, node: Node) {
    root.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !isSelectionInsideComposer(root, sel)) {
      root.appendChild(node);
      const range = document.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    const after = document.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }

  function applyComposerPasteSegments(segments: NonNullable<ReturnType<typeof parseComposerPasteText>>) {
    const root = composerEl.value;
    if (!root) return;

    for (const seg of segments) {
      if (seg.type === "text") {
        if (seg.text) insertNodeAtCaret(root, document.createTextNode(seg.text));
        continue;
      }
      const item: CopySelectionChipItem = {
        kind: "elements",
        id: newCopySelectionChipId(),
        struct: seg.struct,
        subjectType: seg.subjectType,
      };
      copySelectionChips.value = [...copySelectionChips.value, item];
      const chipEl = createChipElement(item);
      insertNodeAtCaret(root, chipEl);
      placeCaretAfterChipGap(chipEl);
    }

    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  async function restoreAttachedFilesFromMeta(files: UserAttachedFileMeta[]): Promise<void> {
    const restored: AttachedFileItem[] = [];
    for (const meta of files) {
      if (!meta.id) continue;
      try {
        const rec = await getUploadFile(meta.id);
        if (!rec) continue;
        const file = new File([rec.blob], meta.name || rec.name, {
          type: meta.type || rec.type || rec.blob.type || "",
          lastModified: meta.lastModified ?? rec.lastModified,
        });
        restored.push({
          id: meta.id,
          file,
          name: meta.name || rec.name,
          size: meta.size ?? file.size,
          type: meta.type || file.type,
          lastModified: meta.lastModified ?? file.lastModified,
          status: "ready",
          previewUrl: createImagePreviewUrl(file, meta.type || file.type),
        });
      } catch {
        // ignore missing/expired upload file
      }
    }
    if (restored.length) attachedFiles.value = restored;
  }

  async function restoreFromUserMessageContent(content: string): Promise<void> {
    copySelectionChips.value = [];
    commandChips.value = [];
    skillChips.value = [];
    tabChips.value = [];
    quoteChips.value = [];
    clearAttachedFiles();
    pendingCopySelectionFromPage.value = null;
    clearComposerDom();
    inputText.value = "";

    const root = composerEl.value;
    if (!root) return;

    const segments = parseUserMessageSegments(content);
    for (const seg of segments) {
      switch (seg.type) {
        case "text":
          if (seg.text) appendComposerTextWithLineBreaks(root, seg.text);
          break;
        case "primarySubject": {
          const item: CopySelectionChipItem = {
            kind: "elements",
            id: newCopySelectionChipId(),
            struct: seg.block.payload,
            subjectType: seg.block.type,
          };
          copySelectionChips.value = [...copySelectionChips.value, item];
          const chipEl = createChipElement(item);
          root.appendChild(chipEl);
          break;
        }
        case "attachedFiles":
          await restoreAttachedFilesFromMeta(seg.files);
          break;
        case "toolInput": {
          const label = toolInputDisplayLabel(seg.block);
          if (label) root.appendChild(document.createTextNode(label));
          break;
        }
        case "command": {
          if (commandChips.value.length > 0) break;
          const item: CommandChipItem = {
            id: newCopySelectionChipId(),
            commandId: seg.commandId,
          };
          commandChips.value = [item];
          root.appendChild(createCommandChipElement(item));
          break;
        }
        case "skill": {
          if (skillChips.value.some((c) => c.skillId === seg.skillId)) break;
          const item: SkillChipItem = {
            id: newCopySelectionChipId(),
            skillId: seg.skillId,
          };
          skillChips.value = [...skillChips.value, item];
          root.appendChild(createSkillChipElement(item));
          break;
        }
        case "tab": {
          const item: TabChipItem = {
            id: newCopySelectionChipId(),
            tabId: seg.tab.tabId,
            title: seg.tab.title || tabMentionUrlDisplayTitle(seg.tab.url),
            url: seg.tab.url,
            favIconUrl: seg.tab.favIconUrl,
          };
          tabChips.value = [...tabChips.value, item];
          root.appendChild(createTabChipElement(item));
          break;
        }
        case "quote": {
          if (quoteChips.value.some((c) => c.quotedMsgId === seg.quotedMsgId)) break;
          const item: QuoteChipItem = {
            id: newCopySelectionChipId(),
            quotedMsgId: seg.quotedMsgId,
            label: resolveQuoteChipLabel?.(seg.quotedMsgId) || t("chat.quote.fallbackLabel"),
          };
          quoteChips.value = [...quoteChips.value, item];
          root.appendChild(createQuoteChipElement(item));
          break;
        }
      }
    }

    syncInputTextFromComposer();
    await nextTick();
    autosizeInput();
    placeCaretAtComposerEnd(root);
  }

  function preventComposerPasteDefault(e: ClipboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof (e as any).stopImmediatePropagation === "function") {
      (e as any).stopImmediatePropagation();
    }
  }

  function autosizeInput() {
    const el = composerEl.value;
    if (!el) return;
    if (el.clientWidth <= 0) {
      requestAnimationFrame(() => autosizeInput());
      return;
    }
    // 窄侧栏 / 发送后短 placeholder：最低保持两行，避免高度回弹抖动
    const minH = resolveComposerMinHeight(el);
    el.style.minHeight = `${minH}px`;

    const plain = extractPlainTextFromComposer(el).trim();
    const hasChips =
      !!el.querySelector(
        "[data-copy-chip-id], [data-command-chip-id], [data-skill-chip-id], [data-tab-chip-id], [data-quote-chip-id]",
      );
    if (!plain && !hasChips) {
      const next = Math.min(minH, INPUT_MAX_HEIGHT_PX);
      el.style.height = `${next}px`;
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minH), INPUT_MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }

  /** 侧栏缩窄时 placeholder 会换行，需随宽度重算高度，否则第二行会被裁切 */
  let inputResizeObserver: ResizeObserver | null = null;
  let lastInputObservedWidth = -1;

  function teardownInputResizeObserver() {
    inputResizeObserver?.disconnect();
    inputResizeObserver = null;
    lastInputObservedWidth = -1;
  }

  function setupInputResizeObserver(el: HTMLElement | null) {
    teardownInputResizeObserver();
    if (!el || typeof ResizeObserver === "undefined") return;
    lastInputObservedWidth = el.clientWidth;
    inputResizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      if (Math.abs(w - lastInputObservedWidth) < 0.5) return;
      lastInputObservedWidth = w;
      autosizeInput();
    });
    inputResizeObserver.observe(el);
  }

  watch(
    composerEl,
    (el) => {
      setupInputResizeObserver(el);
      if (el) void nextTick(() => autosizeInput());
    },
    { flush: "post" },
  );

  watch(
    placeholder,
    () => {
      void nextTick(() => autosizeInput());
    },
    { flush: "post" },
  );

  async function submitComposer() {
    const payload = buildComposerSendPayload();
    if (
      !payload.rawText.trim()
      && !payload.commandIds.length
      && !payload.skillIds.length
      && !payload.tabMentions.length
    ) return;
    if (hasPendingUploadFiles.value) return;

    const hasInteractionChips =
      payload.commandIds.length > 0
      || payload.skillIds.length > 0
      || payload.tabMentions.length > 0
      || payload.quoteMsgIds.length > 0;

    if (hasInteractionChips && onStructuredSend) {
      const proceed = await onStructuredSend(payload);
      if (proceed === false) return;
    } else if (payload.skillIds.length && onSkillSend) {
      await onSkillSend(payload.skillIds[0]!, payload);
    } else if (payload.commandIds.length && onCommandSend) {
      await onCommandSend(payload.commandIds[0]!, payload);
    } else if (payload.tabMentions.length && onTabSend) {
      const tab = payload.tabMentions[0]!;
      await onTabSend(
        {
          tabId: tab.tabId,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
        },
        payload,
      );
    } else {
      await onSend(payload);
    }

    copySelectionChips.value = [];
    commandChips.value = [];
    skillChips.value = [];
    tabChips.value = [];
    quoteChips.value = [];
    clearAttachedFiles();
    pendingCopySelectionFromPage.value = null;
    clearComposerDom();
    inputText.value = "";
    closeSlashMenu();
    closeAtMenu();
    await nextTick();
    autosizeInput();
    composerEl.value?.focus();
  }

  async function enqueueFromComposer() {
    if (!loading.value || !conversationId.value) return;
    const payload = buildComposerSendPayload();
    if (!payload.rawText.trim() || hasPendingUploadFiles.value) return;
    if (!onEnqueue) return;

    onEnqueue(payload.rawText);
    copySelectionChips.value = [];
    commandChips.value = [];
    skillChips.value = [];
    tabChips.value = [];
    quoteChips.value = [];
    clearAttachedFiles();
    pendingCopySelectionFromPage.value = null;
    clearComposerDom();
    inputText.value = "";
    closeSlashMenu();
    closeAtMenu();
    await nextTick();
    autosizeInput();
    composerEl.value?.focus();
  }

  async function onComposerKeydown(e: KeyboardEvent) {
    if (atMenuOpen.value) {
      const count = atMenuSelectableCount.value;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (count > 0) {
          atActiveIndex.value = (atActiveIndex.value + 1) % count;
          atScrollActiveTick.value++;
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (count > 0) {
          atActiveIndex.value = (atActiveIndex.value - 1 + count) % count;
          atScrollActiveTick.value++;
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAtMenu();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (count > 0) selectActiveAtMenuItem();
        return;
      }
    }

    if (slashMenuOpen.value) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashActiveIndex.value =
          (slashActiveIndex.value + 1) % slashMenuSelectableCount.value;
        slashScrollActiveTick.value++;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const len = slashMenuSelectableCount.value;
        slashActiveIndex.value = (slashActiveIndex.value - 1 + len) % len;
        slashScrollActiveTick.value++;
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSlashMenu();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectActiveSlashMenuItem();
        return;
      }
    }

    if (e.key !== "Enter") {
      if (!(e as KeyboardEvent & { isComposing?: boolean }).isComposing) {
        void nextTick(() => {
          updateSlashMenuState();
          void updateAtMenuState();
        });
      }
      return;
    }
    if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing) return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (loading.value) {
      await enqueueFromComposer();
      return;
    }
    await submitComposer();
  }

  function onLoadingControlClick() {
    if (canEnqueue.value) {
      void enqueueFromComposer();
    } else {
      onStop?.();
    }
  }

  async function onSendClick() {
    if (loading.value) {
      await enqueueFromComposer();
      return;
    }
    await submitComposer();
  }

  function onComposerInput() {
    syncInputTextFromComposer();
    if (loading.value) {
      void nextTick(() => autosizeInput());
      return;
    }
    syncChipsFromDom();
    hydrateComposerChipFavicons();
    updateSlashMenuState();
    void updateAtMenuState();
    normalizeEmptyComposerDom();
    void nextTick(() => autosizeInput());
  }

  function handleCopySelectionChipClick(chipId: string) {
    const chip = copySelectionChips.value.find((c) => c.id === chipId);
    if (!chip || chip.kind !== "elements") return;
    onChipScrollToPage(chip);
  }

  function onComposerClick(e: MouseEvent) {
    if (loading.value) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest("[data-quote-chip-dismiss]")) {
      e.preventDefault();
      const wrap = t.closest("[data-quote-chip-id]");
      const id = wrap?.getAttribute("data-quote-chip-id");
      if (id) removeQuoteChip(id);
      return;
    }
    if (t.closest("[data-skill-chip-dismiss]")) {
      e.preventDefault();
      const wrap = t.closest("[data-skill-chip-id]");
      const id = wrap?.getAttribute("data-skill-chip-id");
      if (id) removeSkillChip(id);
      return;
    }
    if (t.closest("[data-command-chip-dismiss]")) {
      e.preventDefault();
      const wrap = t.closest("[data-command-chip-id]");
      const id = wrap?.getAttribute("data-command-chip-id");
      if (id) removeCommandChip(id);
      return;
    }
    if (t.closest("[data-tab-chip-dismiss]")) {
      e.preventDefault();
      const wrap = t.closest("[data-tab-chip-id]");
      const id = wrap?.getAttribute("data-tab-chip-id");
      if (id) removeTabChip(id);
      return;
    }
    if (t.closest("[data-copy-chip-dismiss]")) {
      e.preventDefault();
      const wrap = t.closest("[data-copy-chip-id]");
      const id = wrap?.getAttribute("data-copy-chip-id");
      if (id) removeCopySelectionChip(id);
      return;
    }
    const quoteWrap = t.closest("[data-quote-chip-id]");
    if (quoteWrap) {
      e.preventDefault();
      const quotedMsgId = quoteWrap.getAttribute("data-quoted-msg-id");
      if (quotedMsgId) onQuoteChipClick?.(quotedMsgId);
      return;
    }
    const chipWrap = t.closest("[data-copy-chip-id]");
    if (!chipWrap) return;
    const id = chipWrap.getAttribute("data-copy-chip-id");
    if (!id) return;
    handleCopySelectionChipClick(id);
  }

  function normalizeTextForCopyPasteMatch(s: string): string {
    let t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    try {
      t = t.normalize("NFC");
    } catch {
      /* ignore */
    }
    return t.trim();
  }

  function extractFilesFromClipboard(dt: DataTransfer | null | undefined): File[] {
    if (!dt) return [];
    const out: File[] = [];
    const seenKeys = new Set<string>();
    const seenImageSizeType = new Set<string>();

    const push = (f: File | null | undefined) => {
      if (!f) return;
      const key = `${f.name}|${f.size}|${f.type}|${f.lastModified}`;
      if (seenKeys.has(key)) return;

      const mime = (f.type || "").toLowerCase();
      if (mime.startsWith("image/")) {
        const imageKey = `${mime}|${f.size}`;
        if (seenImageSizeType.has(imageKey)) return;
        seenImageSizeType.add(imageKey);
      }

      seenKeys.add(key);
      out.push(f);
    };

    try {
      const items = dt.items ? Array.from(dt.items) : [];
      for (const it of items) {
        if (it?.kind === "file") push(it.getAsFile());
      }
      if (out.length) return out;
    } catch {
      // ignore
    }

    try {
      if (dt.files?.length) {
        for (const f of Array.from(dt.files)) push(f);
      }
    } catch {
      // ignore
    }
    return out;
  }

  function onComposerPaste(e: ClipboardEvent) {
    if (loading.value) return;
    const clip = e.clipboardData?.getData("text/plain") ?? "";

    const pending = pendingCopySelectionFromPage.value;
    if (pending && pending.kind === "elements" && (pending.struct.text ?? "").trim() && clip) {
      const a = normalizeTextForCopyPasteMatch(clip);
      const b = normalizeTextForCopyPasteMatch(pending.struct.text ?? "");
      if (a === b) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof (e as any).stopImmediatePropagation === "function") {
          (e as any).stopImmediatePropagation();
        }
        const root = composerEl.value;
        if (!root) return;
        const item: CopySelectionChipItem = {
          kind: "elements",
          id: newCopySelectionChipId(),
          struct: pending.struct,
          subjectType: pending.subjectType,
          ...(pending.selectionAnchor ? { selectionAnchor: pending.selectionAnchor } : {}),
        };
        copySelectionChips.value = [...copySelectionChips.value, item];
        const chipEl = createChipElement(item);
        insertChipElementAtCaret(root, chipEl);
        pendingCopySelectionFromPage.value = null;
        syncInputTextFromComposer();
        void nextTick(() => autosizeInput());
        return;
      }
    }

    const clipboardFiles = extractFilesFromClipboard(e.clipboardData);
    if (clipboardFiles.length) {
      preventComposerPasteDefault(e);
      addDroppedFiles(clipboardFiles);
      return;
    }

    const html = e.clipboardData?.getData("text/html") ?? "";
    const htmlSegments = html.trim() ? parseComposerPasteHtml(html) : null;
    if (htmlSegments?.some((s) => s.type === "elements")) {
      preventComposerPasteDefault(e);
      applyComposerPasteSegments(htmlSegments);
      return;
    }

    if (!clip) return;
    const segments = parseComposerPasteText(clip);
    if (!segments) return;

    preventComposerPasteDefault(e);
    applyComposerPasteSegments(segments);
  }

  function addElementsChipToComposer(
    struct: PageElementsPayload,
    subjectType: PrimarySubjectType,
    selectionAnchor?: CopySelectionAnchor,
  ) {
    const root = composerEl.value;
    if (!root) return;
    const item: CopySelectionChipItem = {
      kind: "elements",
      id: newCopySelectionChipId(),
      struct,
      subjectType,
      ...(selectionAnchor ? { selectionAnchor } : {}),
    };
    copySelectionChips.value = [...copySelectionChips.value, item];
    const chipEl = createChipElement(item);
    insertChipElementAtCaret(root, chipEl);
    syncInputTextFromComposer();
    void nextTick(() => autosizeInput());
  }

  function resetAfterSend(): void {
    copySelectionChips.value = [];
    commandChips.value = [];
    skillChips.value = [];
    tabChips.value = [];
    quoteChips.value = [];
    closeSlashMenu();
    closeAtMenu();
    clearAttachedFiles();
    pendingCopySelectionFromPage.value = null;
    clearComposerDom();
    inputText.value = "";
    void nextTick(() => {
      autosizeInput();
      const root = composerEl.value;
      if (root) placeCaretAtComposerEnd(root);
    });
  }

  onMounted(() => {
    void loadSlashSkills();
    void loadSlashCommands();
    void nextTick(() => autosizeInput());
  });

  onBeforeUnmount(() => {
    teardownInputResizeObserver();
  });

  function focus(): void {
    composerEl.value?.focus();
  }

  /** 将 ChatComposer 组件 expose 的 DOM ref 同步到 composable（组件内持有真实 DOM） */
  function syncDomFromUi(ui: {
    composerEl?: HTMLDivElement | null;
    attachFileInputEl?: HTMLInputElement | null;
  } | null): void {
    if (!ui) return;
    if (ui.composerEl !== undefined) composerEl.value = ui.composerEl;
    if (ui.attachFileInputEl !== undefined) attachFileInputEl.value = ui.attachFileInputEl;
  }

  const binding = computed<ChatComposerBinding>(() => ({
    mode,
    attachedFiles: attachedFiles.value,
    composerDataEmpty: composerDataEmpty.value,
    hasPendingUploadFiles: hasPendingUploadFiles.value,
    canEnqueue: canEnqueue.value,
    loading: loading.value,
    scopeActive: scopeActive.value,
    placeholder: placeholder.value,
    composerContentEditable: COMPOSER_CONTENT_EDITABLE,
    canSend: canSend.value,
    conversationId: conversationId.value ?? null,
    onRemoveAttachedFile: removeAttachedFile,
    onComposerKeydown,
    onComposerPaste,
    onComposerInput,
    onComposerClick,
    onComposerDragEnter,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    onAttachFileClick,
    onAttachFileChange,
    onWorkspaceClick,
    onScopeToggle,
    onSendClick,
    onLoadingControlClick,
    slashCommandMenu: {
      visible: slashMenuOpen.value,
      skillTitle: t("chat.skills.menuTitle"),
      commandTitle: t("chat.commands.menuTitle"),
      emptyText: t("chat.commands.menuEmpty"),
      skillItems: slashSkillMenuItems.value,
      commandItems: slashCommandMenuItems.value,
      query: slashQuery.value,
      activeIndex: slashActiveIndex.value,
      scrollActiveTick: slashScrollActiveTick.value,
      onSelect: ({ id, kind }) => applySlashMenuSelection(id, kind),
      onHoverIndex: (index) => {
        slashActiveIndex.value = index;
      },
      addSkillLabel: t("chat.skills.addSkill"),
      addSkillFooterIndex: slashAddSkillFooterIndex.value,
      builtinBadgeLabel: t("chat.skills.builtinBadge"),
      editSkillLabel: t("chat.skills.editSkill"),
      onAddSkill: openAddSkillDialog,
      onEditSkill: openEditSkillDialog,
    },
    tabMentionMenu: {
      visible: atMenuOpen.value,
      menuTitle: t("chat.tabs.menuTitle"),
      emptyText: t("chat.tabs.menuEmpty"),
      emptyTitleLabel: t("chat.tabs.untitledTab"),
      emptyUrlLabel: t("chat.tabs.emptyUrl"),
      newTabPlaceholder: t("chat.tabs.newTabPlaceholder"),
      newTabConfirmLabel: t("chat.tabs.newTabConfirm"),
      historyTitle: t("chat.tabs.historyTitle"),
      items: filteredAtMenuItems.value,
      query: atQuery.value,
      activeIndex: atActiveIndex.value,
      scrollActiveTick: atScrollActiveTick.value,
      onSelect: (item: TabMentionMenuViewItem) => applyAtMenuSelection(item),
      onSelectUrl: (payload: TabUrlSelectPayload) => applyUrlTabSelection(payload),
      onHoverIndex: (index: number) => {
        atActiveIndex.value = index;
      },
    },
    addSkillDialog: {
      visible: showAddSkillDialog.value,
      mode: editingSkillId.value ? "edit" : "create",
      title: editingSkillId.value
        ? t("chat.skills.addDialog.editTitle")
        : t("chat.skills.addDialog.title"),
      nameLabel: t("chat.skills.addDialog.nameLabel"),
      namePlaceholder: t("chat.skills.addDialog.namePlaceholder"),
      allowModelRouteLabel: t("chat.skills.addDialog.allowModelRoute"),
      descriptionLabel: t("chat.skills.addDialog.descriptionLabel"),
      descriptionPlaceholder: t("chat.skills.addDialog.descriptionPlaceholder"),
      bodyLabel: t("chat.skills.addDialog.bodyLabel"),
      cancelText: t("chat.skills.addDialog.cancel"),
      saveText: t("chat.skills.addDialog.save"),
      savingText: t("chat.skills.addDialog.saving"),
      deleteText: t("chat.skills.addDialog.delete"),
      deletingText: t("chat.skills.addDialog.deleting"),
      exportText: t("chat.skills.addDialog.export"),
      exportingText: t("chat.skills.addDialog.exporting"),
      saving: addSkillSaving.value,
      deleting: addSkillDeleting.value,
      exporting: addSkillExporting.value,
      submitError: addSkillError.value,
      initialName: editSkillInitial.value.name,
      initialAllowModelRoute: editSkillInitial.value.allowModelRoute,
      initialDescription: editSkillInitial.value.description,
      initialBody: editSkillInitial.value.body,
      onCancel: () => {
        showAddSkillDialog.value = false;
        editingSkillId.value = null;
        addSkillError.value = "";
      },
      onSave: saveAddSkill,
      onDelete: deleteAddSkill,
      onExport: exportAddSkill,
    },
  }));

  return {
    composerEl,
    attachFileInputEl,
    binding,
    syncDomFromUi,
    buildMessageText,
    resetAfterSend,
    restoreFromUserMessageContent,
    addElementsChipToComposer,
    insertQuoteChipAtCaret,
    focus,
    openAddSkillDialogWithBody,
  };
}
