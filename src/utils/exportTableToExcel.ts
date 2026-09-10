/** 从 HTML 表格提取二维文本数据 */
export function htmlTableToRows(table: HTMLTableElement): string[][] {
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll("th, td").forEach((cell) => {
      cells.push((cell.textContent ?? "").replace(/\s+/g, " ").trim());
    });
    if (cells.length > 0) rows.push(cells);
  });
  return rows;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return trimmed || "table";
}

/** 将 HTML 表格导出为 .xlsx 并触发下载 */
export async function downloadHtmlTableAsXlsx(
  table: HTMLTableElement,
  filename?: string,
): Promise<void> {
  const rows = htmlTableToRows(table);
  if (rows.length === 0) return;

  const { utils, writeFile } = await import("xlsx");
  const sheet = utils.aoa_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Sheet1");

  const baseName = sanitizeFilename(filename ?? "table");
  writeFile(workbook, `${baseName}.xlsx`);
}
