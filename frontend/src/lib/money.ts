export interface CurrencyInfo {
  code: string;
  decimals: number;
}

/** Unidades mínimas → string para mostrar. Único lugar de formateo de dinero. */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyInfo,
  locale: string,
): string {
  const value = amountMinor / 10 ** currency.decimals;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value);
  return `${formatted} ${currency.code}`;
}

/**
 * Input humano → unidades mínimas (entero). Acepta "1.234,56" y "1,234.56".
 * Devuelve null si no es parseable o resulta negativo.
 */
export function parseMoney(
  input: string,
  currency: CurrencyInfo,
): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "");
    const decPart = cleaned.slice(lastSep + 1);
    normalized = `${intPart}.${decPart}`;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10 ** currency.decimals);
}
