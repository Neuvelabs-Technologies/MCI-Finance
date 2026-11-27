// MCI Group's management P&L ("Group P&L" cube): rows, columns and how actuals from Tally fill them.
// Taken from the group planning tool's export (e.g. 2026_11_MCI_DUBAI_P&L.xlsx). Same order and codes,
// so an uploaded forecast lines up row for row.
//
// Signs follow the group report: costs positive, incomes positive (subtract them in totals).
// Exceptions as in the group tool: Cost of Sales is negative (Turnover + Cost of Sales = Gross Margin).

/** The report's columns, in the group tool's order. */
export const COLUMNS = [
  { key: 'office', label: 'Office' },
  { key: 'localHq', label: 'Local HQ' },
  { key: 'otherOffices', label: 'Other Offices (SC)' },
  { key: 'localAdj', label: 'Local Adjustments' },
  { key: 'localMgmt', label: 'Local Management' },
  { key: 'backOffice', label: 'Back-Office' },
  { key: 'bsl', label: 'Business Service Lines' },
  { key: 'pco', label: 'PCO/SME' },
  { key: 'amc', label: 'AM&C' },
  { key: 'corporate', label: 'Corporate Division' },
  { key: 'specialty', label: 'Specialty' },
] as const;
export type ColumnKey = (typeof COLUMNS)[number]['key'];
export const COLUMN_KEYS = COLUMNS.map((c) => c.key) as ColumnKey[];

export const SERVICE_LINES = ['pco', 'amc', 'corporate', 'specialty'] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

/**
 * Where an account's actual amount goes:
 * - project: by the cost centre (project) on each Tally line, to that project's service line
 * - fte / headcount / gm / sqm: Local Management, spread over the service lines by that key
 * - hq / otherOffices / adjustment / backOffice: stays in that column, not spread
 * - pco / amc / corporate / specialty: all to that one service line
 */
export const TREATMENTS = ['project', 'fte', 'headcount', 'gm', 'sqm', 'hq', 'otherOffices', 'adjustment', 'backOffice', ...SERVICE_LINES] as const;
export type Treatment = (typeof TREATMENTS)[number];
export const ALLOCATION_KEYS = ['fte', 'headcount', 'gm', 'sqm'] as const;
export type AllocationKey = (typeof ALLOCATION_KEYS)[number];

export type RowStyle = '' | 'highlighted' | 'subtotal' | 'total';

interface Base {
  code: string;
  name: string;
  style: RowStyle;
}
/** An account Tally ledgers are mapped to. `income`: credit is positive (shown as is); otherwise a cost (debit shown positive). */
export interface LeafRow extends Base {
  kind: 'leaf';
  income?: boolean;
  treatment: Treatment;
}
/** Sum of other rows, each with a sign. */
export interface TotalRow extends Base {
  kind: 'total';
  sum: [code: string, sign: 1 | -1][];
}
/** Pipeline rows (closed, contracted, prospects…): forecast only, no actual from the books. */
export interface ForecastOnlyRow extends Base {
  kind: 'forecastOnly';
}
/** FTE and office m² from the HR figures entered in the app. */
export interface StatRow extends Base {
  kind: 'stat';
  stat?: 'fte' | 'sqm';
}
/** num / den, worked out per column. */
export interface RatioRow extends Base {
  kind: 'ratio';
  num: string;
  den: string;
}
export type ChartRow = LeafRow | TotalRow | ForecastOnlyRow | StatRow | RatioRow;

const leaf = (code: string, name: string, treatment: Treatment, income = false): LeafRow => ({ kind: 'leaf', code, name, style: '', treatment, ...(income ? { income } : {}) });
const total = (code: string, name: string, style: RowStyle, sum: (string | [string, -1])[]): TotalRow => ({
  kind: 'total',
  code,
  name,
  style,
  sum: sum.map((s) => (typeof s === 'string' ? [s, 1] : [s[0], -1])),
});
const fc = (code: string, name: string, style: RowStyle = ''): ForecastOnlyRow => ({ kind: 'forecastOnly', code, name, style });
const ratio = (code: string, name: string, num: string, den: string): RatioRow => ({ kind: 'ratio', code, name, style: '', num, den });

// Default treatments come from MCI DUBAI's 2026 forecast: staff, IT, admin, travel and depreciation
// split like FTE; rent and utilities like m²; insurance, marketing, audit, bank and FX like gross margin.
// Admins change any of them in the Group P&L setup.
export const CHART: ChartRow[] = [
  fc('CONFGMEVCLOSED', 'Delivered GM closed'),
  fc('CONFIRMEDGM', 'Delivered GM not closed'),
  fc('DELIVEREDGM', 'Delivered GM', 'highlighted'),
  fc('CONFGMFUTEV', 'Contracted GM'),
  fc('DELCONFGM', 'Delivered & Contracted GM', 'highlighted'),
  fc('WEIGHTEDPROSP', 'Weighted Prospects'),
  fc('DELCONFPROSPGM', 'Delivered, Contracted & WP GM', 'highlighted'),
  fc('PROCUREMENTGM', 'Procurement Revenue'),
  fc('TOTOPSGM', 'Gross Margin from Operations & Procurement', 'subtotal'),
  fc('OTHERGM', 'Other Gross Margin / Adjustment with Accounting'),
  fc('TOTOPSPROCGM', 'Gross Margin from Operations & Procurement adjusted', 'subtotal'),
  fc('GAPGM', 'Gross Margin to be found'),
  total('TOTALGM', 'Total Gross Margin', 'total', ['TURNOVER', 'COSTOFSALES']),

  leaf('A500.110', 'Reference Salary (Gross + Benefits + Prov)', 'fte'),
  leaf('A500.130', 'Social charges on salaries', 'fte'),
  leaf('A500.122', 'Commissions (As per SL including Social Charges)', 'fte'),
  leaf('A500.601', 'Staff costs paid to other offices (Workforce)', 'fte'),
  leaf('A500.651', 'Staff costs invoiced to other offices (Workforce)', 'fte'),
  leaf('A500.600', 'Staff cost paid to other offices and consulting', 'fte'),
  leaf('A500.650', 'Staff cost invoiced to other offices (in minus)', 'fte'),
  total('A522', 'Committed Staff Costs', 'highlighted', ['A500.110', 'A500.130', 'A500.122', 'A500.601', 'A500.651', 'A500.600', 'A500.650']),
  leaf('A500.140', 'Reversal deferred Staff costs from previous years', 'fte'),
  leaf('A500.141', 'Deferred Staff costs for future years (in minus)', 'fte'),
  total('A521', 'Committed Staff Costs including DSC Variance', 'highlighted', ['A522', 'A500.140', 'A500.141']),
  leaf('A500.750', 'Staff costs to be hired (TBH - Full costs)', 'fte'),
  total('A520', 'Staff Costs before Variable Part', 'highlighted', ['A521', 'A500.750']),
  leaf('A500.120', 'Staff cost variable part (Bonuses, allowance)', 'fte'),
  leaf('A500.121', 'Rewards (As per SL including Social Charges)', 'fte'),
  leaf('A500.125', 'Social charges on variable part', 'fte'),
  total('A519', 'Variable Part', 'highlighted', ['A500.120', 'A500.121', 'A500.125']),
  total('A517', 'Total Workforce Costs', 'highlighted', ['A520', 'A519']),
  leaf('A516.100', 'Learning and Development', 'fte'),
  leaf('A516.200', 'Recruitement', 'fte'),
  leaf('A516.300', 'Local Internal Meetings', 'fte'),
  leaf('A516.400', 'Various other salaries and staff costs', 'fte'),
  leaf('A516.500', 'Staff Costs Subsidies', 'fte'),
  total('A516', 'Other Staff Costs', 'highlighted', ['A516.100', 'A516.200', 'A516.300', 'A516.400', 'A516.500']),
  total('A500', 'Total Salaries and staff costs', 'subtotal', ['A517', 'A516']),

  leaf('A501.100', 'Office rental', 'sqm'),
  leaf('A501.200', 'Warehouse rental', 'sqm'),
  leaf('A501.300', 'Electricity, water', 'sqm'),
  leaf('A501.400', 'Cleaning office costs', 'sqm'),
  leaf('A501.500', 'Other rental office costs', 'sqm'),
  total('A501', 'Rental & Office Costs', 'highlighted', ['A501.100', 'A501.200', 'A501.300', 'A501.400', 'A501.500']),
  leaf('A502.050', 'Maintenance offices repairs', 'fte'),
  leaf('A502.600', 'Workplace : Licenses (Skype & Other licenses)', 'fte'),
  leaf('A502.601', 'Workplace / Infrastructure Support and Maintenance', 'fte'),
  leaf('A502.602', 'Hosting and Connectivity (Datacenter, Internet con', 'fte'),
  leaf('A502.603', 'Infrastructure : Licenses (Network device licenses', 'fte'),
  leaf('A502.604', 'Business Applications / ERP : Licenses (Rental fees)', 'fte'),
  leaf('A502.605', 'Business Applications / ERP : Support and Maintenance', 'fte'),
  leaf('A502.606', 'AI Licences', 'fte'),
  leaf('A502.201', 'Group IT maintenance costs', 'fte'),
  leaf('A502.400', 'Vehicles maintenance', 'fte'),
  leaf('A502.500', 'Other maintenance costs', 'fte'),
  total('A502', 'Maintenance costs', 'highlighted', ['A502.050', 'A502.600', 'A502.601', 'A502.602', 'A502.603', 'A502.604', 'A502.605', 'A502.606', 'A502.201', 'A502.400', 'A502.500']),
  leaf('A503.050', 'Office consumer goods, F&B, magazines and mailing', 'fte'),
  leaf('A503.100', 'IT consumer goods', 'fte'),
  leaf('A503.350', 'Phone costs (land lines)', 'fte'),
  leaf('A503.360', 'Phone costs (mobile costs)', 'fte'),
  leaf('A503.440', 'Accounting fees (outsourced)', 'fte'),
  leaf('A503.500', 'Legal fees', 'fte'),
  leaf('A503.550', 'External consulting fees', 'fte'),
  leaf('A503.601', 'CSR - Corporate social responsabilities', 'fte'),
  leaf('A503.650', 'Other administrative costs', 'fte'),
  total('A503', 'Administration costs', 'highlighted', ['A503.050', 'A503.100', 'A503.350', 'A503.360', 'A503.440', 'A503.500', 'A503.550', 'A503.601', 'A503.650']),
  leaf('A504.300', 'MCI Group meetings', 'fte'),
  leaf('A504.330', 'Local external meetings', 'fte'),
  leaf('A504.500', 'Travel and accomodation costs linked to lost projects', 'fte'),
  leaf('A504.200', 'Other travel costs', 'fte'),
  total('A504', 'Travel costs', 'highlighted', ['A504.300', 'A504.330', 'A504.500', 'A504.200']),
  leaf('A505.050', 'Local insurance costs', 'gm'),
  leaf('A505.060', 'Group insurance policies', 'gm'),
  leaf('A505.100', 'Vehicle insurance', 'gm'),
  leaf('A505.300', 'Other insurance costs', 'gm'),
  total('A505', 'Insurance costs', 'highlighted', ['A505.050', 'A505.060', 'A505.100', 'A505.300']),
  leaf('A506.051', 'Ovation and Group marketing fees', 'gm'),
  leaf('A506.101', 'Marketing', 'gm'),
  leaf('A506.103', 'Events & Sponsorship', 'gm'),
  leaf('A506.104', 'Memberships & Partnerships', 'gm'),
  leaf('A506.105', 'Research (Only bef. 2026)', 'gm'),
  leaf('A506.106', 'Tools licenses', 'gm'),
  total('A506', 'Marketing costs', 'highlighted', ['A506.051', 'A506.101', 'A506.103', 'A506.104', 'A506.105', 'A506.106']),
  leaf('A507.300', 'Audit Fees', 'gm'),
  leaf('A507.400', 'Bank Fees', 'gm'),
  leaf('A507.500', 'Operating Lease', 'gm'),
  leaf('A507.050', 'Local tax - all taxes (except income tax on profit and equity)', 'gm'),
  total('A507', 'Other external services', 'highlighted', ['A507.300', 'A507.400', 'A507.500', 'A507.050']),
  leaf('A513.200', 'Other incomes / Proceeds from Disposal of assets and others', 'gm', true),
  leaf('A513.300', 'Other income - Internal invoicing, except staff costs', 'gm', true),
  total('A513', 'Other current operating incomes', 'highlighted', ['A513.200', 'A513.300']),
  leaf('A508.051', 'Group Service Agreements', 'hq'),
  leaf('A508.101', 'Reversal Group Operations Costs', 'gm'),
  leaf('A508.200', 'Loss on bad debts & bad debt provision Allowance', 'gm'),
  leaf('A508.300', 'Other Current Operating Expenses', 'gm'),
  total('A508', 'Other current operating expenses', 'highlighted', ['A508.051', 'A508.101', 'A508.200', 'A508.300']),
  total('OpCosts', 'Total Other costs & incomes', 'subtotal', ['A501', 'A502', 'A503', 'A504', 'A505', 'A506', 'A507', ['A513', -1], 'A508']),
  total('TotalOpCosts', 'Total Operating costs', 'total', ['A500', 'OpCosts']),
  total('EBITDA', 'EBITDA', 'total', ['TOTALGM', ['TotalOpCosts', -1]]),

  leaf('A509.100', 'Depreciation on tangible assets', 'fte'),
  leaf('A509.200', 'Depreciation on intangible assets', 'fte'),
  leaf('A509.220', 'Depreciation of user rights (Rental contracts IFRS16)', 'hq'),
  leaf('A509.250', 'Depreciation on customer list', 'fte'),
  leaf('A509.301', 'Goodwill Depreciation  (impairment)', 'adjustment'),
  total('A509', 'Depreciation costs', 'highlighted', ['A509.100', 'A509.200', 'A509.220', 'A509.250', 'A509.301']),
  leaf('A514.100', 'Non recurring incomes (-) and expenses (+)', 'gm'),
  total('EBIT', 'EBIT', 'total', ['EBITDA', ['A509', -1], ['A514.100', -1]]),
  leaf('A514.200', 'Interest and fees paid on financial debts (int&ext)', 'hq'),
  leaf('A514.300', 'Financial interest received (ST Dep, Savings Acc, Loans and CA)', 'gm', true),
  leaf('A514.400', 'Net FX gain (-)  or loss (+) (realised and unrealised)', 'gm'),
  leaf('A514.500', 'Other Financial expenses', 'hq'),
  leaf('A514.600', 'Other Financial incomes (+)', 'gm', true),
  total('A514', 'Total non-recurring and Financial result', 'highlighted', ['A514.200', ['A514.300', -1], 'A514.400', 'A514.500', ['A514.600', -1]]),
  total('EBT', 'EBT', 'total', ['EBIT', ['A514', -1]]),

  { ...leaf('TURNOVER', 'Turnover', 'project', true), style: 'subtotal' },
  // Credit-positive like Turnover, so a cost of sales comes out negative, as in the group tool.
  { ...leaf('COSTOFSALES', 'Cost of Sales', 'project', true), style: 'subtotal' },
  { ...total('FORECASTGM', 'Forecasted Total Gross Margin', 'subtotal', ['TOTALGM']) },
  fc('WEIGHTEDPROSP_100', 'Weighted Prospects at 100%'),
  { kind: 'stat', code: 'TOT ANNUAL FTE', name: 'Total Annualized FTE', style: '', stat: 'fte' },
  fc('ANNUAL FTE TBH', 'Annualized FTE TBH'),
  fc('HC TBH', 'HC to be hired'),
  { kind: 'stat', code: 'SQM', name: 'Office Surface in Square meters', style: '', stat: 'sqm' },
  ratio('EBTVSGM', 'EBT over Gross Margin', 'EBT', 'TOTALGM'),
  ratio('EBITDAVSGM', 'EBITDA over Gross Margin', 'EBITDA', 'TOTALGM'),
  ratio('GMVSTO', 'GM over Turnover', 'TOTALGM', 'TURNOVER'),
  ratio('GMPERFTE', 'GM per employee', 'TOTALGM', 'TOT ANNUAL FTE'),
  fc('CONFGMPERC', '% Confirmed GM'),
  fc('CLOSEDGMPERC', '% Closed GM'),
  ratio('PRODRATIO', 'Productivity Ratio Total Staff Costs', 'A500', 'TOTALGM'),
  ratio('PRODRATIOBOSC', 'Productivity ratio Staff Costs before Other Staff Costs', 'A517', 'TOTALGM'),
  ratio('PRODRATIOBVP', 'Productivity ratio Staff Costs before Variable Part', 'A520', 'TOTALGM'),
  ratio('PRODRATIOCSC', 'Productivity ratio Committed Staff Costs', 'A522', 'TOTALGM'),
];

export const ROW_BY_CODE = new Map(CHART.map((r) => [r.code, r]));
export const LEAVES = CHART.filter((r): r is LeafRow => r.kind === 'leaf');
export const isLeafCode = (code: string) => ROW_BY_CODE.get(code)?.kind === 'leaf';
/** Rows shown as a ratio or a plain count rather than money. */
export const isRatioRow = (code: string) => ROW_BY_CODE.get(code)?.kind === 'ratio' && code !== 'GMPERFTE';
