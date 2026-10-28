// Demo data: a realistic set of sample customers in every state, for demos, training and testing.
//
// Safety:
// - Every record is flagged `demo: true`; codes start with DEMO- so a real import can never match them.
// - Email addresses use the reserved `.example` domain, and the mailer never sends to demo customers.
// - `clearDemoData()` removes the customers, their documents, the demo entity and their activity.
import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { AuditLog, type IAuditLog } from '../models/AuditLog.js';
import { Customer, type CustomerDoc, type EmailLogEntry, type FileHistoryEntry, type ICustomer, type StoredFile } from '../models/Customer.js';
import { EmailMessage, type IEmailMessage } from '../models/EmailMessage.js';
import { Entity } from '../models/Entity.js';
import { Settings, type ISettings } from '../models/Settings.js';
import { ApiError } from '../utils/ApiError.js';
import type { BuyerData, FileField } from '../utils/rules.js';
import { UAE, requiredKeys, isFileField } from '../utils/rules.js';
import { renderEmail, templatesFor } from './mailer.service.js';
import { deleteCustomerFiles, writeCustomerFile } from './storage.service.js';

export const DEMO_CODE_PREFIX = 'DEMO-';

// ---------------- small generators ----------------

const DAY = 864e5;
const rand = (n: number) => crypto.randomInt(n);
const digitsOf = (n: number) => Array.from({ length: n }, () => rand(10)).join('');

/** A valid-looking UAE TRN (15 digits) and its TIN (first 10 digits). */
function trnTin(): { trn: string; tin: string } {
  const trn = `100${digitsOf(9)}003`;
  return { trn, tin: trn.slice(0, 10) };
}

/** A UAE IBAN that passes the mod-97 check. */
function uaeIban(bankCode: string): string {
  const bban = `${bankCode}${digitsOf(16)}`;
  const numeric = `${bban}1014` + '00'; // "AE" → 10 14, check digits 00
  let rem = 0;
  for (const d of numeric) rem = (rem * 10 + Number(d)) % 97;
  return `AE${String(98 - rem).padStart(2, '0')}${bban}`;
}

/** A one-page PDF with the given lines of text, clearly marked as a sample. */
export function samplePdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const text = [
    'BT /F1 22 Tf 72 760 Td (SAMPLE - DEMO DATA) Tj ET',
    'BT /F1 11 Tf 72 738 Td (Not a real document. Generated for demonstration only.) Tj ET',
    ...lines.map((l, i) => `BT /F1 13 Tf 72 ${690 - i * 22} Td (${esc(l)}) Tj ET`),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const FILE_TITLES: Record<FileField, string> = {
  tradeLicence: 'Trade licence',
  trnCertificate: 'VAT registration certificate',
  tinCertificate: 'TIN confirmation',
  signatoryIds: 'Signatory Emirates ID and passport',
  moa: 'Memorandum of Association',
  ubo: 'UBO declaration',
};

// ---------------- the sample customers ----------------

type Scenario =
  | 'not_sent'
  | 'no_email'
  | 'sent'
  | 'sent_email_failed'
  | 'sent_link_expired'
  | 'opened'
  | 'opened_reminded'
  | 'submitted'
  | 'submitted_resubmitted'
  | 'verified'
  | 'needs_correction';

interface Sample {
  name: string;
  contact: string;
  scenario: Scenario;
  country?: string;
  emirate?: string;
  freeZone?: boolean;
  authority?: string;
  vat?: boolean;
  vatGroup?: boolean;
  bank?: [name: string, code: string, swift: string];
  expiredLicence?: boolean;
}

const BANKS: [string, string, string][] = [
  ['Emirates NBD', '026', 'EBILAEAD'],
  ['First Abu Dhabi Bank', '035', 'NBADAEAA'],
  ['Mashreq Bank', '033', 'BOMLAEAD'],
  ['Abu Dhabi Commercial Bank', '030', 'ADCBAEAA'],
  ['Dubai Islamic Bank', '024', 'DUIBAEAD'],
];

const SAMPLES: Sample[] = [
  { name: 'Sandstone Exhibitions LLC', contact: 'Rania Haddad', scenario: 'verified', emirate: 'Dubai', authority: 'Dubai DET', vat: true },
  { name: 'Blue Dhow Hospitality LLC', contact: 'Omar Siddiqui', scenario: 'verified', emirate: 'Dubai', authority: 'Dubai DET', vat: true },
  { name: 'Falcon Crest Audio Visual FZ-LLC', contact: 'Priya Nair', scenario: 'verified', emirate: 'Dubai', freeZone: true, authority: 'DWTC Free Zone', vat: true },
  { name: 'Gulf Pearl Catering LLC', contact: 'Ahmed Al Mansoori', scenario: 'verified', emirate: 'Abu Dhabi', authority: 'Abu Dhabi DED', vat: true, vatGroup: true },
  { name: 'Riyadh Meetings Company', contact: 'Faisal Al Harbi', scenario: 'verified', country: 'Saudi Arabia' },
  { name: 'Oasis Print & Signage FZE', contact: 'Daniel Okafor', scenario: 'submitted', emirate: 'Sharjah', freeZone: true, authority: 'SAIF Zone', vat: true },
  { name: 'Saffron Gate Travel LLC', contact: 'Meera Pillai', scenario: 'submitted', emirate: 'Dubai', authority: 'Dubai DET', vat: true, expiredLicence: true },
  { name: 'Marina Light Productions LLC', contact: 'Lucas Ferreira', scenario: 'submitted_resubmitted', emirate: 'Dubai', authority: 'Dubai DET', vat: true },
  { name: 'Desert Bloom Florists LLC', contact: 'Hessa Al Ketbi', scenario: 'submitted', emirate: 'Ajman', authority: 'Ajman DED', vat: false },
  { name: 'Thames Event Partners Ltd', contact: 'Sophie Turner', scenario: 'submitted', country: 'United Kingdom' },
  { name: 'Corniche Stage Rigging LLC', contact: 'Karim Nasser', scenario: 'needs_correction', emirate: 'Abu Dhabi', authority: 'Abu Dhabi DED', vat: true },
  { name: 'Palm Grove Medical Supplies LLC', contact: 'Dr. Leena Ahmed', scenario: 'needs_correction', emirate: 'Dubai', authority: 'Dubai DET', vat: true },
  { name: 'Al Waha Conference Services LLC', contact: 'Yousef Haddad', scenario: 'opened_reminded', emirate: 'Dubai' },
  { name: 'Horizon Translation Services LLC', contact: 'Elena Petrova', scenario: 'opened', emirate: 'Dubai' },
  { name: 'Bavaria MedTech GmbH', contact: 'Jonas Weber', scenario: 'opened', country: 'Germany' },
  { name: 'Crescent Transport & Logistics LLC', contact: 'Imran Qureshi', scenario: 'sent' },
  { name: 'Lotus Venue Decor LLC', contact: 'Anjali Mehta', scenario: 'sent' },
  { name: 'Silverline Security Services LLC', contact: 'Tariq Rahman', scenario: 'sent_email_failed' },
  { name: 'Coral Reef Digital Media FZ-LLC', contact: 'Nadia Karim', scenario: 'sent_link_expired' },
  { name: 'Summit Photography Studio LLC', contact: 'Chris Mendes', scenario: 'not_sent' },
  { name: 'Golden Sands Hotels & Resorts LLC', contact: 'Fatima Zahra', scenario: 'not_sent' },
  { name: 'Arabian Ink Publishing LLC', contact: '', scenario: 'no_email' },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(llc|fz-llc|fze|ltd|gmbh|company)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 22);

// ---------------- load / clear ----------------

export interface DemoStatus {
  customers: number;
  allowed: boolean;
}

export async function demoStatus(): Promise<DemoStatus> {
  return { customers: await Customer.countDocuments({ demo: true }), allowed: config.allowDemoData };
}

function assertAllowed(): void {
  if (!config.allowDemoData) throw new ApiError(403, 'Demo data is turned off on this server (set ALLOW_DEMO_DATA=true to allow it).');
}

/** Remove every demo record. Real customers and settings are not touched. */
export async function clearDemoData(): Promise<{ customers: number; entities: number; logs: number }> {
  const customers = await Customer.find({ demo: true }).select('_id');
  const ids = customers.map((c) => c._id);
  for (const id of ids) deleteCustomerFiles(id);
  const logs = await AuditLog.deleteMany({ $or: [{ customer: { $in: ids } }, { 'details.demo': true }] });
  await EmailMessage.deleteMany({ $or: [{ demo: true }, { customer: { $in: ids } }] });
  await Customer.deleteMany({ _id: { $in: ids } });

  // A real customer may have ticked the demo entity on the form: hide it instead of deleting it then.
  const demoEntities = await Entity.find({ demo: true });
  let removed = 0;
  for (const e of demoEntities) {
    if (await Customer.exists({ 'data.entities': e._id })) {
      e.active = false;
      await e.save();
    } else {
      await e.deleteOne();
      removed++;
    }
  }
  return { customers: ids.length, entities: removed, logs: logs.deletedCount };
}

/** Replace any existing demo data with a fresh set. */
export async function loadDemoData({ force = false } = {}): Promise<{ customers: number; entities: number }> {
  if (!force) assertAllowed();
  await clearDemoData();

  const settings = await Settings.get();
  const admin = await Admin.findOne().sort({ createdAt: 1 });
  const adminEmail = admin?.email ?? config.admin.email;
  const now = Date.now();

  const realEntity = await Entity.findOne({ active: true, demo: { $ne: true } }).sort({ sortOrder: 1 });
  const demoEntity = await Entity.create({
    key: 'DEMO',
    name: 'Sample Events FZ-LLC (demo entity)',
    licensedBy: 'Licensed by DWTC Free Zone Authority',
    licenceType: 'Trade licence',
    issuingAuthority: 'Dubai World Trade Centre Authority',
    licenceNo: `DWTC-${digitsOf(5)}`,
    ...(() => {
      const t = trnTin();
      return { trn: t.trn, tin: t.tin, peppolId: `0235:${t.tin}` };
    })(),
    address: 'Sample address, Dubai World Trade Centre, Dubai, UAE',
    emirate: 'Dubai',
    freeZone: true,
    contactName: 'Finance Team',
    sortOrder: 99,
    active: true,
    demo: true,
  });
  const entityIds = [realEntity?._id, demoEntity._id].filter(Boolean) as Types.ObjectId[];

  const logs: Partial<IAuditLog>[] = [];
  const mails: Partial<IEmailMessage>[] = [];
  const log = (at: number, action: string, customer: Types.ObjectId | undefined, actor: string, details: Record<string, unknown> = {}) =>
    logs.push({ at: new Date(at), action, customer, actor, details: { ...details, demo: true } });

  let n = 0;
  for (const s of SAMPLES) {
    n++;
    const code = `${DEMO_CODE_PREFIX}${String(1000 + n * 7).padStart(4, '0')}`;
    const domain = `${slug(s.name)}.example`;
    const emails = s.scenario === 'no_email' ? [] : [`accounts@${domain}`, ...(n % 3 === 0 ? [`finance@${domain}`] : [])];
    const created = now - (24 - (n % 4)) * DAY;
    const c = new Customer({
      code,
      name: s.name,
      emails,
      contactName: s.contact || undefined,
      demo: true,
      token: crypto.randomBytes(24).toString('base64url'),
      tokenExpiresAt: new Date(created + settings.linkValidityDays * DAY),
      status: 'new',
      emailLog: [],
    });
    log(created, 'customer.imported', undefined, adminEmail, { file: 'customer-list-demo.xlsx' });

    const isInvited = !['not_sent', 'no_email'].includes(s.scenario);
    const invitedAt = created + (2 + (n % 3)) * DAY;
    if (isInvited) {
      const failed = s.scenario === 'sent_email_failed';
      const entry: EmailLogEntry = { at: new Date(invitedAt), kind: 'invite', to: emails, ok: !failed };
      if (failed) entry.error = '550 5.1.1 Recipient address rejected: mailbox unavailable';
      c.emailLog.push(entry);
      log(invitedAt, 'email.invite', undefined, adminEmail, { count: 1, failed: failed ? 1 : 0 });
      if (!failed) {
        c.status = 'invited';
        c.invitedAt = new Date(invitedAt);
      }
      if (s.scenario === 'sent_link_expired') c.tokenExpiresAt = new Date(now - 2 * DAY);
    }

    const opens = ['opened', 'opened_reminded', 'submitted', 'submitted_resubmitted', 'verified', 'needs_correction'].includes(s.scenario);
    const openedAt = invitedAt + (1 + (n % 4)) * DAY * 0.6;
    if (opens) {
      c.status = 'opened';
      c.openedAt = new Date(openedAt);
      c.lastOpenedAt = new Date(openedAt + DAY * 0.1);
      log(openedAt, 'form.opened', c._id, `customer:${code}`);
    }
    if (s.scenario === 'opened_reminded' || s.scenario === 'sent') {
      for (const k of s.scenario === 'opened_reminded' ? [1, 2] : [1]) {
        const at = Math.min(invitedAt + (4 + k * 3) * DAY, now - DAY * 0.2);
        c.emailLog.push({ at: new Date(at), kind: 'reminder', to: emails, ok: true });
        c.reminderCount = (c.reminderCount ?? 0) + 1;
        c.lastReminderAt = new Date(at);
      }
    }

    const submits = ['submitted', 'submitted_resubmitted', 'verified', 'needs_correction'].includes(s.scenario);
    if (submits) {
      const submittedAt = openedAt + DAY * (0.3 + (n % 3) * 0.5);
      const data = buyerData(s, n, emails[0] ?? `accounts@${domain}`, entityIds);
      const ctx = { sections: settings.sections, hasEntities: entityIds.length > 0 };
      const fields = requiredKeys(data, ctx).filter(isFileField);
      const files: Partial<Record<FileField, StoredFile>> = {};
      const history: FileHistoryEntry[] = [];
      for (const f of fields) {
        files[f] = writeCustomerFile(c._id, f, samplePdf(docLines(s, f, data)), `${slug(s.name)}-${f}.pdf`, 'application/pdf', new Date(submittedAt));
      }
      c.data = { ...data, entities: data.entities, tradeLicenceExpiry: data.tradeLicenceExpiry ? new Date(data.tradeLicenceExpiry) : undefined } as ICustomer['data'];
      c.files = files;
      c.status = 'submitted';
      c.submittedAt = new Date(submittedAt);
      c.submitCount = 1;
      log(submittedAt, 'form.submitted', c._id, `customer:${code}`, { changed: Object.keys(data), filesReplaced: fields, declarant: data.declarantName });

      if (s.scenario === 'needs_correction') {
        const at = submittedAt + DAY * 0.8;
        c.reviewStatus = 'needs_correction';
        c.reviewNote =
          n % 2
            ? 'The trade licence uploaded has expired. Please upload the renewed licence and update the expiry date.'
            : 'The TRN certificate is for a different legal entity. Please upload the certificate issued to your company.';
        log(at, 'review.needs_correction', c._id, adminEmail, { note: c.reviewNote });
        const remindAt = at + DAY * 0.1;
        c.emailLog.push({ at: new Date(remindAt), kind: 'reminder', to: emails, ok: true });
        c.reminderCount = (c.reminderCount ?? 0) + 1;
        c.lastReminderAt = new Date(remindAt);
      } else if (s.scenario === 'verified') {
        c.reviewStatus = 'verified';
        log(submittedAt + DAY * (0.5 + (n % 2)), 'review.verified', c._id, adminEmail, { note: '' });
      } else if (s.scenario === 'submitted_resubmitted') {
        const at = submittedAt + DAY * 1.5;
        const old = files.tradeLicence;
        if (old) history.push({ field: 'tradeLicence', ...old });
        files.tradeLicence = writeCustomerFile(c._id, 'tradeLicence', samplePdf([...docLines(s, 'tradeLicence', data), 'Renewed licence']), `${slug(s.name)}-tradeLicence-renewed.pdf`, 'application/pdf', new Date(at));
        c.files = files;
        c.fileHistory = history;
        c.data = { ...c.data, phone: '+971 4 555 0199', city: 'Dubai' };
        c.submittedAt = new Date(at);
        c.submitCount = 2;
        log(at, 'form.resubmitted', c._id, `customer:${code}`, { changed: ['phone', 'city', 'tradeLicenceExpiry'], filesReplaced: ['tradeLicence'], declarant: data.declarantName });
      }
    }

    mails.push(...demoMails(c, settings, opens));
    await c.save();
    // Back-date the record so lists sort and read naturally
    await Customer.updateOne({ _id: c._id }, { $set: { createdAt: new Date(created), updatedAt: new Date(c.submittedAt ?? c.openedAt ?? c.invitedAt ?? created) } }, { timestamps: false });
    for (const l of logs) if (l.customer === undefined && l.action !== 'customer.imported') l.customer = c._id;
  }

  log(now - 25 * DAY, 'entity.created', undefined, adminEmail, { name: demoEntity.name });
  await AuditLog.insertMany(dedupeImports(logs));
  await EmailMessage.insertMany(mails);
  return { customers: SAMPLES.length, entities: 1 };
}

/** Delivery records for a demo customer's emails: delivered, opened (if they opened the form) or bounced (if it failed). */
function demoMails(c: CustomerDoc, settings: ISettings, opened: boolean): Partial<IEmailMessage>[] {
  const out: Partial<IEmailMessage>[] = [];
  for (const entry of c.emailLog) {
    entry.batchId = crypto.randomUUID();
    const { subject } = renderEmail({ ...templatesFor(entry.kind, settings.email), settings, customer: c });
    const at = new Date(entry.at);
    const later = (h: number) => new Date(at.getTime() + h * 36e5);
    for (const to of entry.to) {
      const status = !entry.ok ? 'bounced' : opened && entry.kind === 'invite' ? 'opened' : 'delivered';
      const detail = entry.ok ? undefined : `Hard bounce: the address does not exist or refuses mail — ${entry.error ?? 'user unknown'} (recipient)`;
      const events = [{ at: later(0.01), type: entry.ok ? 'sent' : 'bounce', detail }];
      if (status === 'opened') events.push({ at: later(5), type: 'open', detail: undefined });
      out.push({ at, kind: entry.kind, customer: c._id, to, subject, provider: 'mailjet', status, statusAt: events.at(-1)?.at, detail, batchId: entry.batchId, events, demo: true });
    }
  }
  return out;
}

/** One "imported" entry per batch looks more like reality than one per customer. */
function dedupeImports(logs: Partial<IAuditLog>[]): Partial<IAuditLog>[] {
  const seen = new Set<string>();
  return logs.filter((l) => {
    if (l.action !== 'customer.imported') return true;
    const day = l.at?.toISOString().slice(0, 10) ?? '';
    if (seen.has(day)) return false;
    seen.add(day);
    l.details = { ...l.details, created: SAMPLES.length, updated: 0, errors: 0 };
    return true;
  });
}

function buyerData(s: Sample, n: number, email: string, entityIds: Types.ObjectId[]): BuyerData {
  const country = s.country ?? UAE;
  const isUae = country === UAE;
  const vat = s.vat ?? true;
  const { trn, tin } = trnTin();
  const bank = s.bank ?? BANKS[n % BANKS.length]!;
  const expiry = new Date(Date.now() + (s.expiredLicence ? -20 : 200 + n * 9) * DAY).toISOString().slice(0, 10);
  const [first = 'Finance', ...rest] = (s.contact || 'Finance Manager').split(' ');
  return {
    entities: entityIds.slice(0, n % 4 === 0 && entityIds.length > 1 ? 2 : 1).map(String),
    companyName: s.name,
    country,
    legalIdType: isUae ? 'TL' : '',
    tradeLicenceNo: isUae ? `${n % 2 ? 'CN' : 'TL'}-${digitsOf(7)}` : `REG-${digitsOf(8)}`,
    licenceIssuingAuthority: isUae ? (s.authority ?? 'Dubai DET') : country === 'United Kingdom' ? 'Companies House' : country === 'Germany' ? 'Amtsgericht München' : 'Ministry of Commerce',
    tradeLicenceExpiry: isUae ? expiry : '',
    emirate: isUae ? (s.emirate ?? 'Dubai') : '',
    freeZone: isUae ? !!s.freeZone : undefined,
    vatRegistered: isUae ? vat : undefined,
    vatGroupMember: isUae && vat ? !!s.vatGroup : undefined,
    trn: isUae && vat ? (s.vatGroup ? `100${digitsOf(9)}003` : trn) : '',
    tin: isUae ? tin : '',
    peppolId: isUae ? `0235:${tin}` : country === 'United Kingdom' ? `0088:50${digitsOf(11)}` : '',
    foreignTaxId: isUae ? '' : country === 'Saudi Arabia' ? `3${digitsOf(14)}` : country === 'United Kingdom' ? `GB${digitsOf(9)}` : `DE${digitsOf(9)}`,
    email,
    invoiceEmail: n % 2 ? `ap@${email.split('@')[1]}` : '',
    phone: isUae ? `+971 4 ${digitsOf(3)} ${digitsOf(4)}` : country === 'United Kingdom' ? `+44 20 ${digitsOf(4)} ${digitsOf(4)}` : `+966 11 ${digitsOf(3)} ${digitsOf(4)}`,
    address: isUae ? `Office ${100 + n * 3}, ${['Business Bay', 'Al Quoz Industrial Area 3', 'Khalifa City', 'Al Majaz', 'Jumeirah Lake Towers'][n % 5]}` : `${10 + n} Sample Street`,
    poBox: isUae ? digitsOf(6) : '',
    city: isUae ? (s.emirate ?? 'Dubai') : country === 'United Kingdom' ? 'London' : country === 'Germany' ? 'Munich' : 'Riyadh',
    bankName: bank[0],
    bankBranch: isUae ? 'Main Branch' : 'Head Office',
    bankAddress: isUae ? `${bank[0]} Head Office, ${s.emirate ?? 'Dubai'}` : 'Head Office',
    iban: isUae ? uaeIban(bank[1]) : country === 'United Kingdom' ? 'GB29NWBK60161331926819' : 'SA0380000000608010167519',
    swift: isUae ? bank[2] : country === 'United Kingdom' ? 'NWBKGB2L' : 'RJHISARI',
    bankContact: `${first} ${rest.join(' ')}, Relationship Manager`.trim(),
    website: n % 3 ? `www.${slug(s.name)}.example` : '',
    declarantName: s.contact || 'Finance Manager',
    declarantDesignation: ['Finance Manager', 'Chief Financial Officer', 'Accounts Manager', 'Managing Director'][n % 4]!,
    declaration: true,
  };
}

function docLines(s: Sample, f: FileField, d: BuyerData): string[] {
  return [
    FILE_TITLES[f],
    `Company: ${s.name}`,
    `Country: ${d.country}`,
    d.tradeLicenceNo ? `Licence / registration no.: ${d.tradeLicenceNo}` : '',
    d.trn ? `TRN: ${d.trn}` : '',
    d.tin ? `TIN: ${d.tin}` : '',
  ].filter(Boolean);
}
