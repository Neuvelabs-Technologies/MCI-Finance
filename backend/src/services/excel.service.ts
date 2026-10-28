import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import type { CustomerDoc, CustomerStatus, ReviewStatus } from '../models/Customer.js';
import type { EmailMessageDoc, MailKind, MailStatus } from '../models/EmailMessage.js';
import type { EntityDoc } from '../models/Entity.js';
import { FILE_FIELDS, LABELS, LEGAL_ID_TYPES } from '../utils/rules.js';
import { isEmail } from '../utils/rules.js';

export const STATUS_LABEL: Record<CustomerStatus, string> = { new: 'Not sent', invited: 'Sent', opened: 'Opened', submitted: 'Submitted' };
export const REVIEW_LABEL: Record<ReviewStatus, string> = { pending: 'To review', verified: 'Verified', needs_correction: 'Needs correction' };

const yn = (v: boolean | undefined) => (v === true ? 'Y' : v === false ? 'N' : '');
const legalLabel = (v: string | undefined) => LEGAL_ID_TYPES.find((t) => t.value === v)?.label ?? v ?? '';
const dt = (v: Date | undefined | null) => (v ? new Date(v) : null);

function styleHeader(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D2433' } };
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

type Cell = string | number | Date | null | undefined;
type Column = [header: string, value: (c: CustomerDoc) => Cell, width: number];

// ---------------- emails export ----------------

export const MAIL_STATUS_LABEL: Record<MailStatus, string> = {
  queued: 'Waiting',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  unsubscribed: 'Unsubscribed',
  spam: 'Marked as spam',
  bounced: 'Bounced',
  blocked: 'Blocked',
  failed: 'Failed',
  accepted: 'Sent (no tracking)',
  not_sent: 'Not sent (log only)',
};
export const MAIL_KIND_LABEL: Record<MailKind, string> = {
  invite: 'Invite',
  reminder: 'Reminder',
  confirmation: 'Confirmation',
  notification: 'Submission alert',
  test: 'Test',
};

type EmailRow = EmailMessageDoc & { customer?: { code?: string; name?: string } | null };

export async function buildEmailExport(emails: EmailRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCI e-Invoicing';
  const ws = wb.addWorksheet('Emails');
  ws.columns = [
    { header: 'Sent at', width: 20 },
    { header: 'To', width: 34 },
    { header: 'Customer code', width: 16 },
    { header: 'Customer', width: 30 },
    { header: 'Type', width: 16 },
    { header: 'Subject', width: 50 },
    { header: 'Status', width: 20 },
    { header: 'Status updated', width: 20 },
    { header: 'Details', width: 60 },
  ];
  for (const e of emails) {
    const c = e.customer && typeof e.customer === 'object' ? e.customer : null;
    ws.addRow([dt(e.at), e.to, c?.code ?? '', c?.name ?? '', MAIL_KIND_LABEL[e.kind], e.subject, MAIL_STATUS_LABEL[e.status], dt(e.statusAt), e.detail ?? '']);
  }
  for (const col of [1, 8]) ws.getColumn(col).numFmt = 'dd/mm/yyyy hh:mm';
  styleHeader(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------- export ----------------

export async function buildExport(customers: CustomerDoc[], entities: EntityDoc[], linkFor: (token: string) => string): Promise<Buffer> {
  const entityName = new Map(entities.map((e) => [String(e._id), e.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'e-Invoicing details collection';
  wb.created = new Date();

  const ws = wb.addWorksheet('Customers');
  const cols: Column[] = [
    ['Customer code', (c) => c.code, 14],
    ['Customer name (our records)', (c) => c.name, 30],
    ['Status', (c) => STATUS_LABEL[c.status] ?? c.status, 11],
    ['Review', (c) => (c.status === 'submitted' ? REVIEW_LABEL[c.reviewStatus] : ''), 15],
    ['Submitted at', (c) => dt(c.submittedAt), 18],
    ['Times submitted', (c) => c.submitCount || 0, 9],
    [LABELS.entities, (c) => (c.data?.entities ?? []).map((id) => entityName.get(String(id)) ?? String(id)).join('; '), 30],
    [LABELS.companyName, (c) => c.data?.companyName, 32],
    [LABELS.country, (c) => c.data?.country, 18],
    [LABELS.legalIdType, (c) => legalLabel(c.data?.legalIdType), 16],
    [LABELS.tradeLicenceNo, (c) => c.data?.tradeLicenceNo, 16],
    [LABELS.licenceIssuingAuthority, (c) => c.data?.licenceIssuingAuthority, 20],
    [LABELS.tradeLicenceExpiry, (c) => dt(c.data?.tradeLicenceExpiry), 14],
    [LABELS.emirate, (c) => c.data?.emirate, 14],
    [LABELS.freeZone, (c) => yn(c.data?.freeZone), 8],
    [LABELS.vatRegistered, (c) => yn(c.data?.vatRegistered), 8],
    [LABELS.vatGroupMember, (c) => yn(c.data?.vatGroupMember), 8],
    [LABELS.trn, (c) => c.data?.trn, 18],
    [LABELS.tin, (c) => c.data?.tin, 13],
    [LABELS.peppolId, (c) => c.data?.peppolId, 18],
    [LABELS.foreignTaxId, (c) => c.data?.foreignTaxId, 18],
    [LABELS.email, (c) => c.data?.email, 26],
    [LABELS.invoiceEmail, (c) => c.data?.invoiceEmail, 26],
    [LABELS.phone, (c) => c.data?.phone, 16],
    [LABELS.address, (c) => c.data?.address, 40],
    [LABELS.poBox, (c) => c.data?.poBox, 10],
    [LABELS.city, (c) => c.data?.city, 14],
    [LABELS.bankName, (c) => c.data?.bankName, 20],
    [LABELS.bankBranch, (c) => c.data?.bankBranch, 18],
    [LABELS.bankAddress, (c) => c.data?.bankAddress, 28],
    [LABELS.iban, (c) => c.data?.iban, 28],
    [LABELS.swift, (c) => c.data?.swift, 13],
    [LABELS.bankContact, (c) => c.data?.bankContact, 26],
    [LABELS.website, (c) => c.data?.website, 22],
    [LABELS.declarantName, (c) => c.data?.declarantName, 20],
    [LABELS.declarantDesignation, (c) => c.data?.declarantDesignation, 18],
    ...FILE_FIELDS.map((f): Column => [`File: ${LABELS[f]}`, (c) => c.files?.[f]?.originalName ?? '', 24]),
    ['Invite emails', (c) => (c.emails ?? []).join(', '), 28],
    ['Invited at', (c) => dt(c.invitedAt), 18],
    ['Reminders sent', (c) => c.reminderCount || 0, 9],
    ['Form link', (c) => (c.token ? linkFor(c.token) : ''), 40],
    ['Review note', (c) => c.reviewNote ?? '', 30],
  ];
  ws.columns = cols.map(([header, , width]) => ({ header, width }));
  for (const c of customers) ws.addRow(cols.map(([, fn]) => fn(c) ?? ''));
  cols.forEach(([header], i) => {
    const col = ws.getColumn(i + 1);
    if (header === 'Submitted at' || header === 'Invited at') col.numFmt = 'dd-mmm-yyyy hh:mm';
    if (header === LABELS.tradeLicenceExpiry) col.numFmt = 'dd-mmm-yyyy';
  });
  // Keep long numbers as text so Excel doesn't turn TRNs into 1.00E+14
  for (const key of [LABELS.trn, LABELS.tin, LABELS.tradeLicenceNo]) {
    ws.getColumn(cols.findIndex(([h]) => h === key) + 1).numFmt = '@';
  }
  styleHeader(ws);

  // Compact sheet for the ERP / ASP buyer master
  const ps = wb.addWorksheet('PEPPOL buyer master');
  ps.columns = [
    { header: 'Customer code', width: 14 },
    { header: 'Buyer legal name', width: 36 },
    { header: 'Country', width: 18 },
    { header: 'TRN', width: 18 },
    { header: 'TIN', width: 13 },
    { header: 'Endpoint scheme', width: 10 },
    { header: 'Endpoint ID', width: 22 },
    { header: 'Legal ID type', width: 10 },
    { header: 'Legal ID number', width: 18 },
    { header: 'Legal ID authority', width: 20 },
    { header: 'Address', width: 40 },
    { header: 'City', width: 14 },
    { header: 'Emirate', width: 14 },
    { header: 'Invoice email', width: 28 },
  ];
  for (const c of customers.filter((x) => x.status === 'submitted')) {
    const d = c.data ?? {};
    const peppol = d.peppolId ?? '';
    const [scheme, id] = peppol.includes(':') ? peppol.split(/:(.*)/s) : ['', peppol];
    ps.addRow([c.code, d.companyName, d.country, d.trn, d.tin, scheme, id, d.legalIdType, d.tradeLicenceNo, d.licenceIssuingAuthority, d.address, d.city, d.emirate, d.invoiceEmail || d.email]);
  }
  for (const i of [4, 5, 7, 9]) ps.getColumn(i).numFmt = '@';
  styleHeader(ps);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.columns = [
    { header: 'Code', width: 14 },
    { header: 'Company name', width: 36 },
    { header: 'Email', width: 36 },
    { header: 'Contact name', width: 24 },
  ];
  ws.addRow(['EXAMPLE', 'Example Trading LLC (this row is ignored)', 'accounts@example.ae, finance@example.ae', 'Jane Doe']);
  styleHeader(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------- import ----------------

export interface ImportItem {
  row: number;
  code: string;
  name: string;
  emails: string[];
  contactName: string;
}
export interface ImportError {
  row: number;
  reason: string;
}

type ImportKey = 'code' | 'name' | 'emails' | 'contactName';
const HEADER_MAP: [ImportKey, RegExp][] = [
  ['code', /^(customer\s*)?(code|id|account|acc(ount)?\s*no\.?)$/i],
  ['name', /^(customer|company|client)?\s*name$|^company$|^customer$/i],
  ['emails', /e-?mail/i],
  ['contactName', /contact/i],
];

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('text' in v && v.text) return String(v.text);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v && v.result !== undefined) return String(v.result);
    if ('hyperlink' in v && v.hyperlink) return String(v.hyperlink).replace(/^mailto:/, '');
  }
  return String(v);
}

async function readRows(buffer: Buffer, filename: string): Promise<string[][]> {
  if (/\.csv$/i.test(filename)) {
    return parse(buffer.toString('utf8').replace(/^﻿/, ''), { skip_empty_lines: true, relax_column_count: true }) as string[][];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  if (!ws) return rows;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    for (let i = 1; i <= ws.columnCount; i++) vals.push(cellText(row.getCell(i).value).trim());
    rows.push(vals);
  });
  return rows;
}

/** Parse a customer list (CSV or XLSX) with Code, Company name, Email and Contact name columns. */
export async function parseCustomerImport(buffer: Buffer, filename: string): Promise<{ items: ImportItem[]; errors: ImportError[] }> {
  const rows = await readRows(buffer, filename);
  const headerRow = rows[0];
  if (!headerRow) return { items: [], errors: [{ row: 0, reason: 'File is empty' }] };
  const header = headerRow.map((h) => String(h).trim());
  const idx: Partial<Record<ImportKey, number>> = {};
  for (const [key, re] of HEADER_MAP) {
    const i = header.findIndex((h, j) => re.test(h) && !Object.values(idx).includes(j));
    if (i >= 0) idx[key] = i;
  }
  if (idx.code === undefined || idx.name === undefined) {
    return { items: [], errors: [{ row: 1, reason: 'Header row must contain "Code" and "Company name" columns' }] };
  }
  const col = (r: string[], k: ImportKey) => (idx[k] !== undefined ? String(r[idx[k]] ?? '') : '');
  const items: ImportItem[] = [];
  const errors: ImportError[] = [];
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const code = col(r, 'code').trim().toUpperCase();
    const name = col(r, 'name').trim();
    const emails = col(r, 'emails').split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const contactName = col(r, 'contactName').trim();
    if (!code && !name) return;
    if (code === 'EXAMPLE') return;
    if (!code) return void errors.push({ row: rowNo, reason: 'Missing code' });
    if (!name) return void errors.push({ row: rowNo, reason: `Missing company name for ${code}` });
    const bad = emails.filter((e) => !isEmail(e));
    if (bad.length) return void errors.push({ row: rowNo, reason: `Invalid email for ${code}: ${bad.join(', ')}` });
    items.push({ row: rowNo, code, name, emails, contactName });
  });
  return { items, errors };
}
