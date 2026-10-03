import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseLoggerFile, parseUploadedFile } from '../src/ingest/parseFile';

const TZ = 'Asia/Jerusalem';
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The sixteen rows quoted in the brief, exactly as given. Every awkward case
 * Summer mentioned is in here, so this one fixture is the main regression test
 * for the whole parser.
 */
const briefSample = readFileSync(resolve(here, 'fixtures/brief-sample.tsv'), 'utf8');

describe("the brief's own sample rows", () => {
  const result = parseLoggerFile(briefSample, TZ);

  it('reads the file even though it is tab-separated, not comma-separated', () => {
    // Summer pastes out of Excel, so this is what actually arrives.
    expect(detectDelimiter(briefSample)).toBe('\t');
    expect(result.validation.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('tab-separated'))).toBe(true);
  });

  it('accepts every row except the one duplicate', () => {
    // 16 rows in, one of them a repeat of TL-0512 at 06:15.
    expect(result.rows).toHaveLength(15);
    expect(result.duplicateCount).toBe(1);
    expect(result.rejections).toEqual([]);
  });

  it('puts the readings in time order even though the file is not', () => {
    // The brief lists Tel Aviv's 05:45 reading four rows after its 06:30 one.
    const times = result.rows.map((row) => row.recordedAt.toISOString());
    expect(times).toEqual([...times].sort());
    expect(times[0]).toBe('2026-09-14T02:45:00.000Z');
  });

  it('reads the Haifa rows despite the day-first dates', () => {
    const haifa = result.rows.filter((row) => row.loggerCode === 'TL-0231');
    expect(haifa).toHaveLength(3);
    expect(haifa[0]!.recordedAt.toISOString()).toBe('2026-09-14T03:00:00.000Z');
    // 38.3 is stored as written. A rule is what converts it, not this parser.
    expect(haifa[0]!.rawNumber).toBe(38.3);
  });

  it('keeps the ERR row as a recorded failure, not as a temperature', () => {
    const err = result.rows.find((row) => row.rawValue === 'ERR');
    expect(err).toBeDefined();
    expect(err!.status).toBe('error');
    expect(err!.rawNumber).toBeNull();
    // It still has a timestamp, so it shows up as a hole at the right moment.
    expect(err!.recordedAt.toISOString()).toBe('2026-09-14T03:30:00.000Z');
  });

  it('folds "tel aviv" into "Tel Aviv"', () => {
    const telAviv = result.rows.filter((row) => row.loggerCode === 'TL-0417');
    const canonicals = new Set(telAviv.map((row) => row.branchCanonical));
    expect(canonicals.size).toBe(1);
    // The display name of each row is preserved as typed; only the key folds.
    expect(new Set(telAviv.map((row) => row.branchName)).size).toBe(2);
  });

  it('sees that the Tel Aviv logger reports from two different fridges', () => {
    const fridges = new Set(
      result.rows.filter((row) => row.loggerCode === 'TL-0417').map((row) => row.fridgeCanonical),
    );
    // Walk-in until the 17th, then Display 2. Turning that into an assignment
    // window is the ingest step's job; here we only prove the signal survives.
    expect(fridges).toEqual(new Set(['walk in', 'display 2']));
  });

  it('keeps the single 9.4 spike as an ordinary reading', () => {
    // A door opening is real data. Deciding it is harmless is the analysis
    // engine's job, not the parser's - the parser must not drop it.
    const spike = result.rows.find((row) => row.rawValue === '9.4');
    expect(spike).toBeDefined();
    expect(spike!.status).toBe('ok');
  });
});

describe('delimiters', () => {
  it.each([
    [',', 'comma'],
    ['\t', 'tab'],
    [';', 'semicolon'],
  ])('detects %s-separated files', (delimiter) => {
    const content = [
      ['Logger', 'Branch', 'Fridge', 'Time', 'Temp'].join(delimiter),
      ['TL-0512', 'Jerusalem', 'Dairy', '2026-09-14 06:00', '3.8'].join(delimiter),
    ].join('\n');

    expect(detectDelimiter(content)).toBe(delimiter);
    const result = parseLoggerFile(content, TZ);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.rawNumber).toBe(3.8);
  });
});

describe('rows that cannot be used', () => {
  it('rejects a row with no logger number and says which row', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:00,3.8',
      ',Jerusalem,Dairy,2026-09-14 06:15,3.9',
    ].join('\n');

    const result = parseLoggerFile(content, TZ);
    expect(result.rows).toHaveLength(1);
    expect(result.rejections).toHaveLength(1);
    // Row 3 as a spreadsheet counts it, including the header.
    expect(result.rejections[0]!.row).toBe(3);
    expect(result.rejections[0]!.reason).toContain('logger');
  });

  it('rejects a row whose timestamp cannot be read, keeping the rest', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0512,Jerusalem,Dairy,sometime tuesday,3.8',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:15,3.9',
    ].join('\n');

    const result = parseLoggerFile(content, TZ);
    expect(result.rows).toHaveLength(1);
    expect(result.rejections[0]!.reason).toContain('unrecognised date format');
  });

  it('refuses a file whose columns cannot be identified, and says what is missing', () => {
    const content = ['Time,Temp', '2026-09-14 06:00,3.8'].join('\n');
    const result = parseLoggerFile(content, TZ);

    expect(result.validation.ok).toBe(false);
    expect(result.validation.missing).toEqual(['logger', 'branch', 'fridge']);
    expect(result.rows).toEqual([]);
  });

  it('does not fall over on an empty file', () => {
    expect(parseLoggerFile('', TZ).validation.ok).toBe(false);
    expect(parseLoggerFile('\n\n', TZ).rows).toEqual([]);
  });
});

describe('two readings for the same logger at the same moment', () => {
  it('silently skips an identical repeat', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:15,3.9',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:15,3.9',
    ].join('\n');

    const result = parseLoggerFile(content, TZ);
    expect(result.rows).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    // A re-paste is routine, so it is not worth bothering Summer about.
    expect(result.warnings.filter((w) => w.includes('two different'))).toEqual([]);
  });

  it('warns when the two readings disagree', () => {
    // This is not a re-paste - it means two loggers are sharing a number, or
    // the file was assembled wrongly, and it needs a human.
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:15,3.9',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:15,7.4',
    ].join('\n');

    const result = parseLoggerFile(content, TZ);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.rawNumber).toBe(3.9);
    expect(result.warnings.some((w) => w.includes('two different temperatures'))).toBe(true);
  });
});

describe('unit hints', () => {
  it('takes Fahrenheit from the column header', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Temp (F)',
      'TL-0231,Haifa,Dairy,14/09/2026 06:00,38.3',
    ].join('\n');

    expect(parseLoggerFile(content, TZ).rows[0]!.unitOverride).toBe('F');
  });

  it('takes the unit from a dedicated column when there is one', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Reading,Unit',
      'TL-0231,Haifa,Dairy,14/09/2026 06:00,38.3,F',
    ].join('\n');

    expect(parseLoggerFile(content, TZ).rows[0]!.unitOverride).toBe('F');
  });

  it('leaves the unit unknown when nothing declares one', () => {
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0512,Jerusalem,Dairy,2026-09-14 06:00,3.8',
    ].join('\n');

    expect(parseLoggerFile(content, TZ).rows[0]!.unitOverride).toBeNull();
  });
});

describe('a logger file with nothing but times and temperatures', () => {
  const RAW = ['Time,Temp', '2026-09-14 06:00,3.8', '2026-09-14 06:15,4.1'].join('\n');

  it('is imported once Summer says which fridge it came from', () => {
    const result = parseLoggerFile(RAW, TZ, {
      loggerCode: 'TL-0512',
      branchName: 'Jerusalem',
      fridgeName: 'Dairy',
    });

    expect(result.validation.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.loggerCode).toBe('TL-0512');
    expect(result.rows[0]!.branchName).toBe('Jerusalem');
    expect(result.rows[0]!.fridgeName).toBe('Dairy');
    expect(result.rows[0]!.rawNumber).toBe(3.8);
  });

  it('yields nothing, and no rejected rows, while it is still unlabelled', () => {
    const result = parseLoggerFile(RAW, TZ);
    expect(result.validation.needsLabels).toBe(true);
    expect(result.rows).toEqual([]);
    // Not row-by-row rejections: the rows are fine, the file just needs a name.
    expect(result.rejections).toEqual([]);
  });

  it('lets the file win where it disagrees with what she typed', () => {
    // She picks one logger for a batch, but a file that names its own fridge
    // per row knows better - otherwise a mislabelled upload would silently
    // move every reading into the wrong fridge.
    const content = [
      'Logger,Branch,Fridge,Time,Temp',
      'TL-0417,Tel Aviv,Walk-in,2026-09-14 06:00,4.1',
    ].join('\n');

    const result = parseLoggerFile(content, TZ, {
      loggerCode: 'TL-0512',
      branchName: 'Jerusalem',
      fridgeName: 'Dairy',
    });

    expect(result.rows[0]!.loggerCode).toBe('TL-0417');
    expect(result.rows[0]!.fridgeName).toBe('Walk-in');
  });

  it('fills in only the blanks when a column exists but a cell is empty', () => {
    const content = ['Logger,Time,Temp', ',2026-09-14 06:00,3.8'].join('\n');

    const result = parseLoggerFile(content, TZ, {
      loggerCode: 'TL-0512',
      branchName: 'Jerusalem',
      fridgeName: 'Dairy',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.loggerCode).toBe('TL-0512');
  });
});

async function workbookBuffer(sheets: { name: string; rows: (string | number | Date)[][] }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('an Excel workbook', () => {
  it('reads the brief sample the same way as the TSV', async () => {
    const rows = briefSample
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.split('\t'));
    const buffer = await workbookBuffer([{ name: 'This week', rows }]);

    const fromExcel = await parseUploadedFile(buffer, TZ, {}, 'summer.xlsx');
    const fromTsv = parseLoggerFile(briefSample, TZ);

    expect(fromExcel.rows).toHaveLength(fromTsv.rows.length);
    expect(fromExcel.duplicateCount).toBe(1);
    expect(fromExcel.rows.find((row) => row.rawValue === 'ERR')?.status).toBe('error');
    expect(fromExcel.warnings.some((warning) => warning.includes('Excel workbook'))).toBe(true);
  });

  it('treats an Excel date cell as a wall-clock time, not UTC', async () => {
    const buffer = await workbookBuffer([
      {
        name: 'Dairy',
        rows: [
          ['Logger', 'Branch', 'Fridge', 'Time', 'Temp'],
          ['TL-0512', 'Jerusalem', 'Dairy', new Date(Date.UTC(2026, 8, 14, 6, 0)), 3.8],
        ],
      },
    ]);

    const result = await parseUploadedFile(buffer, TZ, {}, 'haifa.xlsx');
    expect(result.rows).toHaveLength(1);
    // 06:00 in the cell is 06:00 in Israel, same as a CSV that says "06:00".
    expect(result.rows[0]!.recordedAt.toISOString()).toBe('2026-09-14T03:00:00.000Z');
    expect(result.rows[0]!.rawNumber).toBe(3.8);
  });

  it('reads every sheet that looks like a logger table', async () => {
    const header = ['Logger', 'Branch', 'Fridge', 'Time', 'Temp'];
    const buffer = await workbookBuffer([
      { name: 'Notes', rows: [['Ignore this'], ['just a cover page']] },
      {
        name: 'Jerusalem',
        rows: [header, ['TL-0512', 'Jerusalem', 'Dairy', '2026-09-14 06:00', 3.8]],
      },
      {
        name: 'Tel Aviv',
        rows: [header, ['TL-0417', 'Tel Aviv', 'Walk-in', '2026-09-14 06:00', 4.1]],
      },
    ]);

    const result = await parseUploadedFile(buffer, TZ, {}, 'branches.xlsx');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.loggerCode).sort()).toEqual(['TL-0417', 'TL-0512']);
    expect(result.warnings.some((warning) => warning.includes('Notes'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('2 sheets'))).toBe(true);
  });

  it('tells her to re-save an old .xls instead of importing garbage', async () => {
    const result = await parseUploadedFile(Buffer.from('not-excel'), TZ, {}, 'haifa.xls');
    expect(result.rows).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/old Excel file/);
  });
});
