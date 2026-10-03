import ExcelJS from 'exceljs';

/**
 * Excel dates are a day-count with no timezone. exceljs hands back a Date
 * whose UTC clock matches the wall time in the cell, so we format the UTC
 * parts and let parseTimestamp apply Asia/Jerusalem as usual.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return (
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
      `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return cellText(value.result);
    if ('error' in value) return String(value.error).replace(/^#/, '');
  }
  return String(value).trim();
}

function sheetToRecords(sheet: ExcelJS.Worksheet): string[][] {
  const columnCount = sheet.columnCount;
  if (columnCount === 0) return [];

  const records: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let index = 1; index <= columnCount; index += 1) {
      cells.push(cellText(row.getCell(index).value));
    }
    if (cells.some((cell) => cell !== '')) records.push(cells);
  });
  return records;
}

export function isSpreadsheetFilename(filename: string): boolean {
  return /\.(xlsx|xlsm)$/i.test(filename);
}

/** Old binary Excel. exceljs cannot read it; ask her to re-save. */
export function isLegacyExcelFilename(filename: string): boolean {
  return /\.xls$/i.test(filename) && !isSpreadsheetFilename(filename);
}

export interface SpreadsheetSheet {
  name: string;
  records: string[][];
}

export async function readSpreadsheet(buffer: Buffer): Promise<SpreadsheetSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets.flatMap((sheet) => {
    const records = sheetToRecords(sheet);
    if (records.length === 0) return [];
    return [{ name: sheet.name, records }];
  });
}
