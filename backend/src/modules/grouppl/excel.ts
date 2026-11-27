import ExcelJS from 'exceljs';
import { badRequest } from '../../utils/ApiError.js';
import { CHART, COLUMNS, COLUMN_KEYS, type ChartRow, ROW_BY_CODE } from './chart.js';

// Reads the group planning tool's P&L export (the monthly forecast) and writes the Group P&L as Excel.

export interface ParsedForecast {
  year: number | null;
  label: string;
  version: string;
  entity: string;
  rows: { code: string; values: (number | null)[] }[];
  /** Codes in the file that this app's chart doesn't know (left out). */
  unknownCodes: string[];
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

function cellValue(c: ExcelJS.Cell): unknown {
  const v = c.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as { result?: unknown }).result;
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as { text: unknown }).text;
  }
  return v;
}
const cellText = (c: ExcelJS.Cell) => String(cellValue(c) ?? '').trim();
const cellNumber = (c: ExcelJS.Cell): number | null => {
  const v = cellValue(c);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, '')))) return Number(v.replace(/,/g, ''));
  return null;
};

/** The P&L export: a header row with "Account", "Office", "Local HQ"… and one row per account code. */
export async function parseForecast(buffer: Buffer): Promise<ParsedForecast> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('This file could not be read as an Excel (.xlsx) workbook');
  }
  const wanted = new Map(COLUMNS.map((c, i) => [norm(c.label), i]));

  for (const ws of wb.worksheets) {
    let headerRow = 0;
    const colOf = new Map<number, number>(); // sheet column → report column index
    const accountCols: number[] = [];
    ws.eachRow((row, r) => {
      if (headerRow) return;
      const found = new Map<number, number>();
      const accounts: number[] = [];
      row.eachCell((cell, c) => {
        const key = norm(cellText(cell));
        if (wanted.has(key)) found.set(c, wanted.get(key)!);
        if (key === 'account') accounts.push(c);
      });
      if (found.size >= 3 && [...found.values()].includes(0)) {
        headerRow = r;
        found.forEach((v, k) => colOf.set(k, v));
        accountCols.push(...accounts);
      }
    });
    if (!headerRow) continue;

    // Codes are in the first "Account" column (hidden in the export); names in the last.
    const codeCol = accountCols[0];
    const nameCol = accountCols[accountCols.length - 1];
    const byName = new Map(CHART.map((r) => [norm(r.name), r.code]));
    const rows: ParsedForecast['rows'] = [];
    const unknown: string[] = [];
    const seen = new Set<string>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      let code = codeCol ? cellText(row.getCell(codeCol)) : '';
      if (!ROW_BY_CODE.has(code) && nameCol) code = byName.get(norm(cellText(row.getCell(nameCol)))) ?? code;
      if (!code || code === '~') continue;
      if (!ROW_BY_CODE.has(code)) {
        if (/^[A-Za-z]/.test(code) && code.length <= 40) unknown.push(code);
        continue;
      }
      if (seen.has(code)) continue;
      seen.add(code);
      const values: (number | null)[] = COLUMN_KEYS.map(() => null);
      colOf.forEach((idx, c) => (values[idx] = cellNumber(row.getCell(c))));
      rows.push({ code, values });
    }
    if (!rows.length) continue;

    // Settings above the table: "Year 2026", "Current forecast | Forecast11", "Management Entity MCI DUBAI".
    let year: number | null = null;
    let label = '';
    let version = '';
    let entity = '';
    for (let r = 1; r < headerRow; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) cells.push(cellText(row.getCell(c)));
      cells.forEach((t, i) => {
        const next = cells.slice(i + 1).find((x) => x !== '') ?? '';
        if (/^year$/i.test(t) && /^\d{4}$/.test(next)) year ??= Number(next);
        const yy = /^year\s+(\d{4})$/i.exec(t);
        if (yy) year ??= Number(yy[1]);
        if (/^current forecast$/i.test(t) && next) label ||= next;
        const v = /^version\s{2,}(.+)$/i.exec(t);
        if (v) version ||= v[1].trim();
        const e = /^management entity\s+(.+)$/i.exec(t);
        if (e) entity ||= e[1].trim();
      });
    }
    return { year, label, version, entity, rows, unknownCodes: [...new Set(unknown)] };
  }
  throw badRequest('No Group P&L table found: the file needs a header row with "Account", "Office", "Local HQ"… (the P&L export from the group planning tool)');
}

// ---------------- export ----------------

const MCI_RED = 'FFF43B56';
const MONEY = '#,##0;[Red]-#,##0';
const RATIO = '0.00';

function fmtFor(row: ChartRow): string {
  if (row.kind === 'ratio') return row.code === 'GMPERFTE' ? MONEY : RATIO;
  if (row.kind === 'stat') return row.stat === 'fte' ? '#,##0.0' : '#,##0';
  return MONEY;
}

function styleRow(r: ExcelJS.Row, row: ChartRow, lastCol: number) {
  if (row.style === 'highlighted' || row.style === 'subtotal' || row.style === 'total') r.font = { bold: true };
  for (let c = 1; c <= lastCol; c++) {
    const cell = r.getCell(c);
    if (row.style === 'highlighted') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    if (row.style === 'subtotal') cell.border = { top: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
    if (row.style === 'total') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7EA' } };
      cell.border = { top: { style: 'thin', color: { argb: MCI_RED } }, bottom: { style: 'thin', color: { argb: MCI_RED } } };
    }
  }
}

function sheetHeader(ws: ExcelJS.Worksheet, title: string, lines: string[], headers: string[], widths: number[]) {
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: MCI_RED } };
  lines.forEach((l, i) => (ws.getCell(`A${i + 2}`).value = l));
  const hr = lines.length + 3;
  const row = ws.getRow(hr);
  headers.forEach((h, i) => (row.getCell(i + 1).value = h));
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' };
  row.height = 32;
  for (let c = 1; c <= headers.length; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MCI_RED } };
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: 'frozen', ySplit: hr, xSplit: 2 }];
  return hr;
}

type Values = Map<string, (number | null)[]>;

export interface ExportInput {
  company: string;
  year: number;
  periodLabel: string;
  actual: Values;
  forecast: Values | null;
  forecastLabel: string;
  notes: string[];
}

/** Compared columns on the "Actual vs Forecast" sheet. */
const COMPARE: (typeof COLUMN_KEYS)[number][] = ['office', 'localMgmt', 'pco', 'amc', 'corporate', 'specialty'];

export async function buildGroupPlWorkbook(x: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCI Finance';
  const intro = [`${x.company} · ${x.year}`, `Actual from Tally: ${x.periodLabel}. Currency: AED.`, ...x.notes];

  const table = (name: string, title: string, values: Values, extra: string[]) => {
    const ws = wb.addWorksheet(name);
    const hr = sheetHeader(ws, title, [...intro, ...extra], ['Code', 'Account', ...COLUMNS.map((c) => c.label)], [14, 48, ...COLUMNS.map(() => 15)]);
    CHART.forEach((row, i) => {
      const r = ws.getRow(hr + 1 + i);
      r.getCell(1).value = row.code;
      r.getCell(2).value = row.name;
      (values.get(row.code) ?? []).forEach((v, j) => {
        const cell = r.getCell(3 + j);
        cell.value = v;
        cell.numFmt = fmtFor(row);
      });
      styleRow(r, row, 2 + COLUMNS.length);
    });
  };

  table('Actual', 'Group P&L — Actual', x.actual, []);
  if (x.forecast) {
    table('Forecast', 'Group P&L — Forecast', x.forecast, [`Forecast: ${x.forecastLabel}`]);
    const ws = wb.addWorksheet('Actual vs Forecast');
    const headers = ['Code', 'Account'];
    const widths = [14, 48];
    for (const k of COMPARE) {
      const label = COLUMNS.find((c) => c.key === k)!.label;
      headers.push(`${label}\nActual`, `${label}\nForecast`, `${label}\nVariance`);
      widths.push(14, 14, 14);
    }
    const hr = sheetHeader(ws, 'Group P&L — Actual vs Forecast', [...intro, `Forecast: ${x.forecastLabel} (full year)`], headers, widths);
    CHART.forEach((row, i) => {
      const r = ws.getRow(hr + 1 + i);
      r.getCell(1).value = row.code;
      r.getCell(2).value = row.name;
      const a = x.actual.get(row.code) ?? [];
      const f = x.forecast!.get(row.code) ?? [];
      COMPARE.forEach((k, j) => {
        const idx = COLUMN_KEYS.indexOf(k);
        const av = a[idx] ?? null;
        const fv = f[idx] ?? null;
        const cells = [av, fv, av !== null && fv !== null ? av - fv : null];
        cells.forEach((v, n) => {
          const cell = r.getCell(3 + j * 3 + n);
          cell.value = v;
          cell.numFmt = fmtFor(row);
        });
      });
      styleRow(r, row, headers.length);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
