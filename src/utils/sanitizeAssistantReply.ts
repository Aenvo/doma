/**
 * 从面向用户的助手回复中移除 SoM / 工具内部用的元素编号表述（编号、索引、index 等）。
 * 模型仍可在 tool call 里使用 index；仅清洗展示与持久化的 assistant 文本。
 */
export function sanitizeAssistantUserFacing(text: string): string {
  if (!text) return text;

  let s = text;

  // 索引16和17、索引 16、索引16
  s = s.replace(/索引\s*\d+(?:\s*(?:和|、|或|与)\s*(?:索引\s*)?\d+)*/gi, "");
  // 编号10、编号 10和 11
  s = s.replace(/编号\s*\d+(?:\s*(?:和|、|或|与)\s*(?:编号\s*)?\d+)*/gi, "");
  // （编号10）、（索引 16）
  s = s.replace(/[（(]\s*(?:编号|索引)\s*\d+(?:\s*(?:和|、)\s*\d+)*\s*[）)]/gi, "");
  // index: 27 / index 27
  s = s.replace(/\bindex\s*[:：]?\s*\d+(?:\s*(?:和|、|or)\s*\d+)*/gi, "");
  // 元素编号 10、元素10
  s = s.replace(/元素(?:编号)?\s*\d+/gi, "该元素");
  // 方括号标注 [16]、[10]（SoM 截图标记，非 markdown 链接）
  s = s.replace(/\[(\d{1,4})\]/g, "");
  // 残留「第 N 个元素/输入框」式内部指代
  s = s.replace(/第\s*\d+\s*(?:个)?\s*(?:元素|控件|输入框|按钮)/gi, "对应");

  // 标点与空白整理（保留换行：markdown 块级语法依赖 \n）
  s = s.replace(/，\s*，/g, "，");
  s = s.replace(/,\s*,/g, ",");
  s = s.replace(/[^\S\n]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s;
}
