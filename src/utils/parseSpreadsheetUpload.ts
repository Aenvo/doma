import type { ParsedSheetStorage } from "./parseUploadFileContent";

const MAX_SHEETS = 10;
const MAX_CELL_CHARS = 500;

function trimCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value).replace(/\r\n/g, "\n").trim();
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}…` : s;
}

/** 仅在 sidepanel 上传时调用；service worker 禁止 import xlsx */
export async function parseSpreadsheetFileForStorage(
  blob: Blob,
  _name: string,
): Promise<ParsedSheetStorage[]> {
  const { read, utils } = await import("xlsx");
  const buf = await blob.arrayBuffer();
  const workbook = read(buf, {
    type: "array",
    cellDates: true,
    raw: false,
  });

  const sheets: ParsedSheetStorage[] = [];

  for (const sheetName of workbook.SheetNames.slice(0, MAX_SHEETS)) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawRows = utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    const rows = rawRows
      .filter((row) => Array.isArray(row))
      .map((row) => (row as unknown[]).map(trimCell))
      .filter((row) => row.some((cell) => cell.length > 0));

    if (rows.length) sheets.push({ name: sheetName, rows });
  }

  return sheets;
}
