/** SoM elements 短 key schema（som-schema-v1）— 与 annotateInteractiveElements 输出一致 */

export const SOM_ELEMENT_SCHEMA: Record<string, string> = {
  i: "index（SoM 编号，tool 参数 index）",
  tg: "tag（元素标签，如 button/input）",
  tx: "text（可见文本，截断）",
  id: "id（HTML id）",
  rl: "role（ARIA role）",
  tp: "type（input type 等）",
  ph: "placeholder",
  al: "aria-label",
  tt: "title 属性",
  fl: "fieldLabel（关联 label 文本，优先于 ph）",
  sec: "section（向上最近的区块标题/legend，如购买方信息）",
  st: "state（disabled/readonly/checked/expanded/collapsed）",
  vl: "value（input/textarea 当前值，截断）",
  sd: "side（相对视口：left/center/right）",
  cp: "captcha（true=验证码，用 browser_long_press + index）",
  dr: "draggable（true=可拖拽）",
  ht: "hint（工具提示）",
  hf: "href（链接，截断）",
};

export const SOM_SCHEMA_VERSION = "som-schema-v1";

export function formatSomScreenshotContext(
  elements: unknown[],
  extra?: { hint?: string; areas?: unknown[] },
): string {
  const schemaLine = JSON.stringify(SOM_ELEMENT_SCHEMA);
  const itemsLine = JSON.stringify(elements);
  let text =
    "这是当前页面的截图，可交互元素已用内部序号标注（仅供 tool 调用，禁止写进对用户的回复）。\n\n"
    + `somSchema(${SOM_SCHEMA_VERSION}): ${schemaLine}\n`
    + `elements: ${itemsLine}\n`;
  if (extra?.areas && Array.isArray(extra.areas) && extra.areas.length > 0) {
    text += `areas: ${JSON.stringify(extra.areas)}\n`;
  }
  text +=
    "\n选 index 时：结合截图位置 + elements 的 fl/sec/sd/st 过滤；browser_click / browser_type 等传 index（即 i），优先于 selector。"
    + "向用户说明页面时只用按钮文字、placeholder、业务含义，禁止出现编号/索引/index。";
  if (extra?.hint?.trim()) {
    text += `\n${extra.hint.trim()}`;
  }
  return text;
}
