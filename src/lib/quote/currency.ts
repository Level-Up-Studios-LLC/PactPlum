import { currencyExponent } from "@/lib/money";
import type { Adjustment, Quote, QuoteItem } from "./schema";

/**
 * Returns a copy of the quote in another currency. Every minor-unit amount keeps
 * its decimal value (12.50 stays 12.50, rounded half up when the new currency has
 * fewer decimals). Catalog links are per currency, so they are cleared.
 */
export function changeQuoteCurrency(quote: Quote, currency: string): Quote {
  if (currency === quote.currency) return quote;
  const factor = 10 ** (currencyExponent(currency) - currencyExponent(quote.currency));
  const scale = (minor: number) => Math.round(Number((minor * factor).toFixed(6)));
  const moneyColumns = new Set(quote.columns.filter((column) => column.type === "money").map((column) => column.id));

  const scaleAdjustment = (adjustment: Adjustment | null): Adjustment | null =>
    adjustment?.type === "absolute" ? { type: "absolute", amount: scale(adjustment.amount) } : adjustment && { ...adjustment };

  const scaleItem = (item: QuoteItem): QuoteItem => ({
    ...item,
    productId: null,
    price: scale(item.price),
    discount: scaleAdjustment(item.discount),
    values: Object.fromEntries(
      Object.entries(item.values).map(([id, value]) => [id, moneyColumns.has(id) && typeof value === "number" ? scale(value) : value]),
    ),
  });

  return {
    ...quote,
    currency,
    columns: quote.columns.map((column) => ({ ...column })),
    sections: quote.sections.map((section) => ({ ...section, items: section.items.map(scaleItem) })),
    discount: scaleAdjustment(quote.discount),
    tax: scaleAdjustment(quote.tax),
  };
}
