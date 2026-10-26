import { describe, expect, it } from 'vitest';
import { UAE, ibanIsValid, isBlockedFileName, normPeppol, normalise, validate } from '../src/utils/rules.js';

const ALL_FILES = { tradeLicence: true, trnCertificate: true, tinCertificate: true, signatoryIds: true, moa: true, ubo: true };
const CTX = { sections: { ownership: true, bank: true }, hasEntities: true };

const validUae = {
  entities: ['e1'],
  companyName: 'Acme Trading LLC',
  country: UAE,
  legalIdType: 'TL',
  tradeLicenceNo: '123456',
  licenceIssuingAuthority: 'Dubai DET',
  tradeLicenceExpiry: '2099-01-01',
  emirate: 'Dubai',
  vatRegistered: true,
  trn: '100123456700003',
  tin: '1001234567',
  peppolId: '0235:1001234567',
  email: 'accounts@acme.example',
  phone: '+971 4 123 4567',
  address: 'Office 1, Dubai',
  bankName: 'Bank',
  bankBranch: 'Main',
  bankAddress: 'Dubai',
  iban: 'AE070331234567890123456',
  swift: 'EBILAEAD',
  bankContact: 'RM',
  declarantName: 'Jane',
  declarantDesignation: 'CFO',
  declaration: true,
};

describe('validate', () => {
  it('accepts a complete UAE submission', () => {
    const r = validate(normalise(validUae), CTX, ALL_FILES);
    expect(r.errors).toEqual({});
    expect(r.complete).toBe(r.total);
  });

  it('requires every document', () => {
    const r = validate(normalise(validUae), CTX, {});
    expect(r.errors.tradeLicence).toBe('Please upload this document.');
    expect(r.errors.ubo).toBeDefined();
  });

  it('checks TRN and TIN lengths', () => {
    const r = validate(normalise({ ...validUae, trn: '12345', tin: '123' }), CTX, ALL_FILES);
    expect(r.errors.trn).toMatch(/15 digits/);
    expect(r.errors.tin).toMatch(/10 digits/);
  });

  it('does not need a TRN when not VAT registered, but still needs a TIN', () => {
    const r = validate(normalise({ ...validUae, vatRegistered: false, trn: '' }), CTX, ALL_FILES);
    expect(r.errors.trn).toBeUndefined();
    expect(r.required).not.toContain('trn');
    expect(r.required).toContain('tin');
  });

  it('warns when the TIN is not the start of the TRN, unless in a VAT group', () => {
    const data = { ...validUae, tin: '1009999999', peppolId: '0235:1009999999' };
    expect(validate(normalise(data), CTX, ALL_FILES).warnings.tin).toBeDefined();
    expect(validate(normalise({ ...data, vatGroupMember: true }), CTX, ALL_FILES).warnings.tin).toBeUndefined();
  });

  it('drops UAE-only fields for overseas customers', () => {
    const d = normalise({ ...validUae, country: 'United Kingdom', peppolId: '0088:5790000435951' });
    expect(d.trn).toBe('');
    expect(d.emirate).toBe('');
    const r = validate(d, CTX, ALL_FILES);
    expect(r.required).not.toContain('tin');
    expect(r.errors).toEqual({});
  });

  it('skips optional sections when they are switched off', () => {
    const r = validate(normalise({ ...validUae, iban: '' }), { sections: { ownership: false, bank: false }, hasEntities: false }, { tradeLicence: true, trnCertificate: true, tinCertificate: true });
    expect(r.errors).toEqual({});
  });
});

describe('normalisers', () => {
  it('turns a bare TIN into a UAE PEPPOL ID', () => {
    expect(normPeppol('1001234567')).toBe('0235:1001234567');
    expect(normPeppol('0235-1001234567')).toBe('0235:1001234567');
  });

  it('strips spaces and upper-cases IBAN and SWIFT', () => {
    const d = normalise({ iban: 'ae07 0331 2345 6789 0123 456', swift: 'ebil aead' });
    expect(d.iban).toBe('AE070331234567890123456');
    expect(d.swift).toBe('EBILAEAD');
  });

  it('checks IBANs with mod-97', () => {
    expect(ibanIsValid('AE070331234567890123456')).toBe(true);
    expect(ibanIsValid('AE080331234567890123456')).toBe(false);
    expect(ibanIsValid('GB29NWBK60161331926819')).toBe(true);
    expect(ibanIsValid('AE07033123456789012345')).toBe(false); // UAE must be 23 characters
  });
});

describe('isBlockedFileName', () => {
  it('allows documents and photos of any kind', () => {
    for (const n of ['report.docx', 'Licence.PDF', 'scan.heic', 'sheet.xlsx', 'docs.zip', 'photo.jpeg', 'no-extension']) expect(isBlockedFileName(n)).toBe(false);
  });
  it('blocks programs, scripts and web pages', () => {
    for (const n of ['setup.exe', 'x.HTML', 'run.sh', 'macro.vbs', 'app.msi', 'evil.js']) expect(isBlockedFileName(n)).toBe(true);
  });
});
