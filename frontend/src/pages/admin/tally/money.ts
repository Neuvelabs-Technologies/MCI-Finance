// Tally amounts for the dashboard. MCI's books are in AED.

const full = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const short = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', notation: 'compact', maximumFractionDigits: 1 });

/** AED 12,345.60 */
export const money = (n: number): string => full.format(n);

const whole = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 });

/** AED 12,346 — for lists where space is tight. */
export const moneyWhole = (n: number): string => whole.format(n);

/** AED 12.3K — for KPI tiles. */
export const moneyShort = (n: number): string => short.format(n);
