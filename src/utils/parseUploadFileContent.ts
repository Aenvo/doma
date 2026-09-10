const SPREADSHEET_EXT = /\.(xlsx|xls|csv|ods|tsv)$/i;

const SPREADSHEET_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  "text/tab-separated-values",
]);

const TEXT_EXT = /\.(txt|md|markdown|json|xml|html|htm|log|yaml|yml|js|ts|css|less|scss|vue)$/i;

export const DEFAULT_LINE_LIMIT = 200;
export const MAX_LINE_LIMIT = 500;

export type ParsedSheetStorage = {
  name: string;
  rows: string[][];
};

export type LinePageOptions = {
  offset?: number;
  limit?: number;
};

export type SpreadsheetPageOptions = LinePageOptions & {
  sheetIndex?: number;
  sheetName?: string;
};

export type FileLinePagination = {
  offset: number;
  limit: number;
  total: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type TextLinePage = {
  pagination: FileLinePagination;
  lines: string[];
  text: string;
};

export type SpreadsheetRowPage = {
  sheetName: string;
  sheetIndex: number;
  totalSheets: number;
  sheetNames: string[];
  columnCount: number;
  pagination: FileLinePagination;
  rows: string[][];
  text: string;
};

export function normalizeLinePageOptions(opts?: LinePageOptions): { offset: number; limit: number } {
  const offset =
    typeof opts?.offset === "number" && Number.isFinite(opts.offset)
      ? Math.max(0, Math.floor(opts.offset))
      : 0;
  const limit =
    typeof opts?.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(MAX_LINE_LIMIT, Math.max(1, Math.floor(opts.limit)))
      : DEFAULT_LINE_LIMIT;
  return { offset, limit };
}

export function buildLinePagination(
  total: number,
  offset: number,
  limit: number,
  returned: number,
): FileLinePagination {
  const next = offset + returned;
  return {
    offset,
    limit,
    total,
    returned,
    hasMore: next < total,
    nextOffset: next < total ? next : null,
  };
}

export function rowsToMarkdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => {
    const copy = [...row];
    while (copy.length < width) copy.push("");
    return copy.map((cell) => cell.replace(/\|/g, "\\|").replace(/\n/g, " "));
  });
  const lines = normalized.map((row) => `| ${row.join(" | ")} |`);
  lines.splice(1, 0, `| ${normalized[0]!.map(() => "---").join(" | ")} |`);
  return lines.join("\n");
}

export function isSpreadsheetUpload(name: string, mimeType: string): boolean {
  if (SPREADSHEET_EXT.test(name)) return true;
  const mime = mimeType.toLowerCase();
  if (SPREADSHEET_MIMES.has(mime)) return true;
  return mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv");
}

export function isTextUpload(name: string, mimeType: string): boolean {
  if (TEXT_EXT.test(name)) return true;
  const mime = mimeType.toLowerCase();
  return mime.startsWith("text/") || mime.includes("json") || mime.includes("xml");
}

export async function readTextLinePage(blob: Blob, opts?: LinePageOptions): Promise<TextLinePage> {
  const { offset, limit } = normalizeLinePageOptions(opts);
  const raw = await blob.text();
  const lines = raw.split(/\r?\n/);
  const slice = lines.slice(offset, offset + limit);
  return {
    pagination: buildLinePagination(lines.length, offset, limit, slice.length),
    lines: slice,
    text: slice.join("\n"),
  };
}

function resolveSheetIndex(
  sheetNames: string[],
  opts?: SpreadsheetPageOptions,
): { sheetIndex: number; sheetName: string } | null {
  if (!sheetNames.length) return null;

  const byName = typeof opts?.sheetName === "string" ? opts.sheetName.trim() : "";
  if (byName) {
    const idx = sheetNames.findIndex((name) => name === byName);
    if (idx >= 0) return { sheetIndex: idx, sheetName: sheetNames[idx]! };
    return null;
  }

  const idx =
    typeof opts?.sheetIndex === "number" && Number.isFinite(opts.sheetIndex)
      ? Math.max(0, Math.floor(opts.sheetIndex))
      : 0;
  if (idx >= sheetNames.length) return null;
  return { sheetIndex: idx, sheetName: sheetNames[idx]! };
}

/** 从 sidepanel 预解析并存入 IndexedDB 的表格数据分页读取（service worker 安全，不依赖 xlsx） */
export function paginateStoredSpreadsheet(
  parsedSheets: ParsedSheetStorage[],
  opts?: SpreadsheetPageOptions,
): SpreadsheetRowPage | null {
  if (!parsedSheets.length) return null;

  const sheetNames = parsedSheets.map((s) => s.name);
  const resolved = resolveSheetIndex(sheetNames, opts);
  if (!resolved) return null;

  const sheet = parsedSheets[resolved.sheetIndex];
  if (!sheet) return null;

  const { offset, limit } = normalizeLinePageOptions(opts);
  const allRows = sheet.rows;
  const slice = allRows.slice(offset, offset + limit);
  const columnCount = slice.reduce((max, row) => Math.max(max, row.length), 0);

  return {
    sheetName: resolved.sheetName,
    sheetIndex: resolved.sheetIndex,
    totalSheets: parsedSheets.length,
    sheetNames,
    columnCount,
    pagination: buildLinePagination(allRows.length, offset, limit, slice.length),
    rows: slice,
    text: rowsToMarkdownTable(slice),
  };
}

export async function csvBlobToStoredSheet(blob: Blob, name = "Sheet1"): Promise<ParsedSheetStorage[]> {
  const raw = await blob.text();
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  const rows = lines.map((line) => line.split(",").map((cell) => cell.trim()));
  if (!rows.length) return [];
  return [{ name, rows }];
}
