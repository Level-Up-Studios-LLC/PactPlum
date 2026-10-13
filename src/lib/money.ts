// Money is stored as integer minor units (cents for USD, yen for JPY) plus an ISO 4217 code.

export const MAX_MINOR_AMOUNT = 999_999_999_999;

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value) && SUPPORTED_CURRENCIES.has(value);
}

export function currencyExponent(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-US"): string {
  const exponent = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** exponent);
}

/**
 * Parses a non-negative decimal string such as "1,250.50" into minor units.
 * Returns null for malformed input, more decimals than the currency allows,
 * or amounts above MAX_MINOR_AMOUNT.
 */
export function parseMoney(input: string, currency: string): number | null {
  // Commas are accepted only as thousands separators: "1,250.50" yes, "12,5" no.
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) return null;
  const exponent = currencyExponent(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return null;
  const whole = Number(match[1].replace(/,/g, ""));
  const minor = whole * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR_AMOUNT ? minor : null;
}

/** Minor units to the plain decimal string an input field shows: 125050 USD -> "1250.50". */
export function minorToDecimalString(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return (minor / 10 ** exponent).toFixed(exponent);
}
