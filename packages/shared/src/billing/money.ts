// Integer sen arithmetic. Every amount in the billing layer is a whole number
// of sen; RM appears only at the display edge. Rounding is half-up, per line.

export type Sen = number;

/** Rounds a non-integer sen value half-up to a whole sen. */
export function roundSen(value: number): Sen {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

/** Applies a basis-point rate: bps(12345, 800) = 8% of RM 123.45 → 988 sen. */
export function bps(amount: Sen, rateBps: number): Sen {
  return roundSen((amount * rateBps) / 10_000);
}

/** Splits a tax-inclusive amount into its exclusive part: incl / (1 + rate). */
export function exclFromIncl(inclusive: Sen, rateBps: number): Sen {
  return roundSen((inclusive * 10_000) / (10_000 + rateBps));
}

/** 'RM 12.30' from 1230 sen. */
export function formatSen(sen: Sen, withPrefix = true): string {
  const negative = sen < 0;
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100).toLocaleString('en-MY');
  const rest = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${withPrefix ? 'RM ' : ''}${ringgit}.${rest}`;
}

/** Parses '1.20' or 'RM 1.20' into sen. Returns null when not a money string. */
export function parseSen(text: string): Sen | null {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundSen(value * 100);
}
