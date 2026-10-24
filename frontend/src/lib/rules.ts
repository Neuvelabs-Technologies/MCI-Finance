// Validation rules for the e-invoicing customer form.
//
// This file exists twice, byte-for-byte identical:
//   backend/src/utils/rules.ts   (API validation)
//   frontend/src/lib/rules.ts    (live validation in the form)
// Edit one, then run `npm run sync:rules` from the repo root to copy it to the other.
// `npm run check:rules` fails if they drift apart.

export const UAE = 'United Arab Emirates';

export const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

// Legal registration identifier types accepted by PINT AE (TL / EID / PAS / CD)
export const LEGAL_ID_TYPES = [
  { value: 'TL', label: 'Trade licence' },
  { value: 'EID', label: 'Emirates ID (sole establishment)' },
  { value: 'PAS', label: 'Passport' },
  { value: 'CD', label: 'Cabinet / Emiri decree or other document' },
] as const;

export type LegalIdType = (typeof LEGAL_ID_TYPES)[number]['value'];

export const COUNTRIES = [
  UAE, 'Saudi Arabia', 'Oman', 'Qatar', 'Bahrain', 'Kuwait', 'India', 'United Kingdom', 'United States', 'Switzerland',
  '—',
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bangladesh', 'Belarus', 'Belgium', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei',
  'Bulgaria', 'Cambodia', 'Cameroon', 'Canada', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cyprus',
  'Czech Republic', 'Denmark', 'Djibouti', 'Dominican Republic', 'Ecuador', 'Egypt', 'Estonia', 'Ethiopia', 'Finland',
  'France', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Hong Kong', 'Hungary', 'Iceland', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kyrgyzstan', 'Latvia', 'Lebanon', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malaysia', 'Maldives', 'Malta', 'Mauritius', 'Mexico', 'Moldova',
  'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands',
  'New Zealand', 'Nigeria', 'North Macedonia', 'Norway', 'Pakistan', 'Palestine', 'Panama', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Romania', 'Russia', 'Rwanda', 'Serbia', 'Seychelles', 'Singapore', 'Slovakia', 'Slovenia',
  'Somalia', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Syria', 'Taiwan', 'Tajikistan',
  'Tanzania', 'Thailand', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'Uruguay', 'Uzbekistan',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Other',
];

export const FILE_FIELDS = ['tradeLicence', 'trnCertificate', 'tinCertificate', 'signatoryIds', 'moa', 'ubo'] as const;
export type FileField = (typeof FILE_FIELDS)[number];
export const isFileField = (k: string): k is FileField => (FILE_FIELDS as readonly string[]).includes(k);

/** Buyer details submitted through the form, after normalisation. */
export interface BuyerData {
  entities: string[];
  companyName: string;
  country: string;
  legalIdType: string;
  tradeLicenceNo: string;
  licenceIssuingAuthority: string;
  tradeLicenceExpiry: string; // yyyy-mm-dd
  emirate: string;
  freeZone?: boolean;
  vatRegistered?: boolean;
  vatGroupMember?: boolean;
  trn: string;
  tin: string;
  peppolId: string;
  foreignTaxId: string;
  email: string;
  invoiceEmail: string;
  phone: string;
  address: string;
  poBox: string;
  city: string;
  bankName: string;
  bankBranch: string;
  bankAddress: string;
  iban: string;
  swift: string;
  bankContact: string;
  website: string;
  declarantName: string;
  declarantDesignation: string;
  declaration: boolean;
}

export type FieldKey = keyof BuyerData | FileField;

export const LABELS: Record<FieldKey, string> = {
  entities: 'Company you deal with',
  companyName: 'Company name (as per trade licence)',
  country: 'Country of registration',
  legalIdType: 'Licence / document type',
  tradeLicenceNo: 'Trade licence number',
  licenceIssuingAuthority: 'Licence issuing authority',
  tradeLicenceExpiry: 'Trade licence expiry date',
  emirate: 'Emirate in which the company is registered',
  freeZone: 'Free zone based',
  vatRegistered: 'Registered for UAE VAT',
  vatGroupMember: 'Member of a VAT group',
  trn: 'VAT / TRN number',
  tin: 'TIN (Tax Identification Number)',
  peppolId: 'PEPPOL ID',
  foreignTaxId: 'Tax / VAT number in your country',
  email: 'Company official email ID',
  invoiceEmail: 'Email for receiving invoices',
  phone: 'Company landline / mobile number',
  address: 'Registered company address',
  poBox: 'P.O. Box',
  city: 'City',
  bankName: 'Bank name',
  bankBranch: 'Bank branch name',
  bankAddress: 'Bank address',
  iban: 'Bank account no. / IBAN',
  swift: 'SWIFT code',
  bankContact: 'Bank contact name and number',
  website: 'Website',
  declarantName: 'Name of person submitting',
  declarantDesignation: 'Designation',
  declaration: 'Declaration',
  tradeLicence: 'Company trade licence',
  trnCertificate: 'VAT / TRN certificate copy',
  tinCertificate: 'TIN (Tax Identification) copy',
  signatoryIds: 'Emirates ID and passport copy of authorised signatory/ies',
  moa: 'Memorandum of Association or Certificate of Incumbency',
  ubo: 'Ultimate beneficial owner (UBO) details',
};

export const labelOf = (k: string): string => (LABELS as Record<string, string>)[k] ?? k;

// ---------- normalisers ----------
export const digits = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
export const clean = (v: unknown): string => String(v ?? '').trim();
export const normIban = (v: unknown): string => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const normSwift = (v: unknown): string => String(v ?? '').replace(/\s+/g, '').toUpperCase();

export function normPeppol(v: unknown, isUae = true): string {
  let s = String(v ?? '').replace(/\s+/g, '');
  if (!s) return '';
  if (isUae) {
    if (/^\d{10}$/.test(s)) return `0235:${s}`;
    s = s.replace(/^0235[-_.]/, '0235:');
  }
  return s;
}

export function ibanIsValid(raw: unknown): boolean {
  const iban = normIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('AE') && iban.length !== 23) return false;
  const re = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (v: unknown): boolean => EMAIL_RE.test(clean(v));
const isEmailList = (v: unknown): boolean =>
  clean(v)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .every(isEmail);
const isPhone = (v: unknown): boolean => /^\+?[\d\s\-()./]{7,25}$/.test(clean(v)) && digits(v).length >= 7;

const present = (v: unknown): boolean => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== '';
};

const toBool = (v: unknown): boolean | undefined =>
  v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : undefined;

/** Apply normalisation to raw form data (returns a new object). */
export function normalise(d: Partial<Record<string, unknown>> = {}): BuyerData {
  const country = clean(d.country) || UAE;
  const isUae = country === UAE;
  return {
    entities: Array.isArray(d.entities) ? d.entities.map(String) : [],
    companyName: clean(d.companyName),
    country,
    legalIdType: clean(d.legalIdType) || (isUae ? 'TL' : ''),
    tradeLicenceNo: clean(d.tradeLicenceNo),
    licenceIssuingAuthority: clean(d.licenceIssuingAuthority),
    tradeLicenceExpiry: clean(d.tradeLicenceExpiry).slice(0, 10),
    emirate: isUae ? clean(d.emirate) : '',
    freeZone: isUae ? toBool(d.freeZone) : undefined,
    vatRegistered: isUae ? toBool(d.vatRegistered) : undefined,
    vatGroupMember: isUae ? toBool(d.vatGroupMember) : undefined,
    trn: isUae ? digits(d.trn) : '',
    tin: isUae ? digits(d.tin) : '',
    peppolId: normPeppol(d.peppolId, isUae),
    foreignTaxId: isUae ? '' : clean(d.foreignTaxId),
    email: clean(d.email).toLowerCase(),
    invoiceEmail: clean(d.invoiceEmail).toLowerCase(),
    phone: clean(d.phone),
    address: clean(d.address),
    poBox: clean(d.poBox),
    city: clean(d.city),
    bankName: clean(d.bankName),
    bankBranch: clean(d.bankBranch),
    bankAddress: clean(d.bankAddress),
    iban: normIban(d.iban),
    swift: normSwift(d.swift),
    bankContact: clean(d.bankContact),
    website: clean(d.website),
    declarantName: clean(d.declarantName),
    declarantDesignation: clean(d.declarantDesignation),
    declaration: d.declaration === true || d.declaration === 'true',
  };
}

export interface ValidationContext {
  sections?: { ownership?: boolean; bank?: boolean };
  hasEntities?: boolean;
}

export type FieldMessages = Partial<Record<FieldKey, string>>;

export interface ValidationResult {
  errors: FieldMessages;
  warnings: FieldMessages;
  required: FieldKey[];
  complete: number;
  total: number;
}

/** List the required keys for this data + context. */
export function requiredKeys(d: BuyerData, ctx: ValidationContext = {}): FieldKey[] {
  const isUae = (d.country || UAE) === UAE;
  const s = ctx.sections ?? {};
  const keys: FieldKey[] = [];
  if (ctx.hasEntities) keys.push('entities');
  keys.push('companyName', 'country');
  if (isUae) {
    keys.push('legalIdType', 'tradeLicenceNo', 'licenceIssuingAuthority', 'tradeLicenceExpiry', 'emirate', 'tradeLicence');
    keys.push('vatRegistered');
    if (d.vatRegistered === true) keys.push('trn', 'trnCertificate');
    keys.push('tin', 'tinCertificate', 'peppolId');
  } else {
    keys.push('tradeLicenceNo', 'tradeLicence');
  }
  if (s.ownership) keys.push('signatoryIds', 'moa', 'ubo');
  keys.push('email', 'phone', 'address');
  if (s.bank) keys.push('bankName', 'bankBranch', 'bankAddress', 'iban', 'swift', 'bankContact');
  keys.push('declarantName', 'declarantDesignation', 'declaration');
  return keys;
}

/**
 * Validate normalised data.
 * files = { fieldName: true } for every file already on record or newly attached.
 */
export function validate(
  d: BuyerData,
  ctx: ValidationContext = {},
  files: Partial<Record<FileField, boolean>> = {}
): ValidationResult {
  const errors: FieldMessages = {};
  const warnings: FieldMessages = {};
  const isUae = (d.country || UAE) === UAE;
  const required = requiredKeys(d, ctx);

  let complete = 0;
  for (const k of required) {
    const has = isFileField(k) ? !!files[k] : k === 'declaration' ? d.declaration === true : present(d[k]);
    if (has) complete++;
    else
      errors[k] =
        k === 'declaration'
          ? 'Please tick the declaration to confirm.'
          : isFileField(k)
            ? 'Please upload this document.'
            : 'This field is required.';
  }

  const fmt = (k: keyof BuyerData, ok: boolean, msg: string) => {
    if (present(d[k]) && !errors[k] && !ok) errors[k] = msg;
  };

  if (isUae) {
    fmt('trn', /^\d{15}$/.test(d.trn), 'TRN must be exactly 15 digits.');
    fmt('tin', /^\d{10}$/.test(d.tin), 'TIN must be exactly 10 digits.');
    fmt('peppolId', /^0235:\d{10}$/.test(d.peppolId), 'UAE PEPPOL ID format is 0235: followed by your 10-digit TIN, e.g. 0235:1234567890.');
    if (d.emirate) fmt('emirate', EMIRATES.includes(d.emirate), 'Select an emirate.');
    if (/^\d{15}$/.test(d.trn) && /^\d{10}$/.test(d.tin) && d.trn.slice(0, 10) !== d.tin && !d.vatGroupMember)
      warnings.tin = 'Your TIN is normally the first 10 digits of your TRN. If you are part of a VAT group this can differ — please double-check.';
    if (/^0235:\d{10}$/.test(d.peppolId) && /^\d{10}$/.test(d.tin) && d.peppolId.slice(5) !== d.tin)
      warnings.peppolId = 'Your PEPPOL ID normally ends with your TIN.';
  } else if (present(d.peppolId)) {
    fmt('peppolId', /^\d{4}:[A-Za-z0-9.\-_:]{2,}$/.test(d.peppolId), 'Enter the PEPPOL ID as scheme:identifier, e.g. 0088:5790000435951.');
  }

  if (present(d.tradeLicenceExpiry)) {
    const dt = new Date(d.tradeLicenceExpiry);
    if (Number.isNaN(dt.getTime())) errors.tradeLicenceExpiry = 'Enter a valid date.';
    else if (dt < new Date(new Date().toDateString()))
      warnings.tradeLicenceExpiry = 'This licence appears to have expired. Please upload the renewed licence if available.';
  }

  fmt('email', isEmail(d.email), 'Enter a valid email address.');
  fmt('invoiceEmail', isEmailList(d.invoiceEmail), 'Enter valid email address(es), separated by commas.');
  fmt('phone', isPhone(d.phone), 'Enter a valid phone number, e.g. +971 4 123 4567.');
  fmt('iban', ibanIsValid(d.iban), d.iban.startsWith('AE') && d.iban.length !== 23 ? 'UAE IBANs start with AE and have 23 characters.' : 'This IBAN is not valid — please check it.');
  fmt('swift', /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(d.swift), 'SWIFT code must be 8 or 11 characters.');
  fmt('website', /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(d.website), 'Enter a valid website, e.g. www.example.com.');

  return { errors, warnings, required, complete, total: required.length };
}
