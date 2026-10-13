import { MAX_MINOR_AMOUNT } from "@/lib/money";
import { evaluateFormula, type FormulaAst, FormulaError, parseFormula } from "./formula";
import type { Adjustment, Quote, QuoteItem, QuoteSection } from "./schema";

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

export type LineTotal = {
  sectionId: string;
  itemId: string;
  included: boolean;
  base: number;
  discount: number;
  net: number;
};

export type QuoteTotals = {
  currency: string;
  lines: LineTotal[];
  sections: { sectionId: string; net: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

export function isItemIncluded(section: QuoteSection, item: QuoteItem): boolean {
  return section.kind === "multichoice" ? item.selected : !item.optional || item.selected;
}

// Rounds half up to whole minor units, after trimming binary floating-point noise.
function roundMinor(value: number): number {
  return Math.round(Number(value.toFixed(6)));
}

function adjustmentAmount(adjustment: Adjustment | null, of: number): number {
  if (!adjustment) return 0;
  return adjustment.type === "percent" ? roundMinor((of * adjustment.value) / 100) : adjustment.amount;
}

export function computeQuote(quote: Quote): QuoteTotals {
  const amount = parseFormula(quote.amountFormula);
  const columnFormulas = new Map<string, FormulaAst>();
  for (const column of quote.columns) {
    if (column.formula !== null) columnFormulas.set(column.id, parseFormula(column.formula));
  }

  const lines: LineTotal[] = [];
  const sections: QuoteTotals["sections"] = [];
  let subtotal = 0;

  for (const section of quote.sections) {
    let sectionNet = 0;
    for (const item of section.items) {
      const base = lineBase(quote, item, amount, columnFormulas);
      const discount = Math.min(adjustmentAmount(item.discount, base), base);
      const net = base - discount;
      const included = isItemIncluded(section, item);
      if (included) sectionNet += net;
      lines.push({ sectionId: section.id, itemId: item.id, included, base, discount, net });
    }
    sections.push({ sectionId: section.id, net: sectionNet });
    subtotal += sectionNet;
  }

  const discount = Math.min(adjustmentAmount(quote.discount, subtotal), subtotal);
  const tax = adjustmentAmount(quote.tax, subtotal - discount);
  const total = subtotal - discount + tax;
  if (total > MAX_MINOR_AMOUNT) throw new QuoteError("The quote total is too large.");
  return { currency: quote.currency, lines, sections, subtotal, discount, tax, total };
}

function lineBase(quote: Quote, item: QuoteItem, amount: FormulaAst, columnFormulas: Map<string, FormulaAst>): number {
  const values: Record<string, number> = { price: item.price, qty: item.qty };
  try {
    for (const column of quote.columns) {
      if (column.type === "text") continue;
      const formula = columnFormulas.get(column.id);
      if (formula) {
        values[column.id] = evaluateFormula(formula, values);
      } else {
        const raw = item.values[column.id];
        values[column.id] = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      }
    }
    const base = roundMinor(evaluateFormula(amount, values));
    if (base < 0) throw new QuoteError(`"${item.name}" has a negative amount.`);
    if (base > MAX_MINOR_AMOUNT) throw new QuoteError(`"${item.name}" is too large.`);
    return base;
  } catch (error) {
    if (error instanceof FormulaError) throw new QuoteError(`"${item.name}": ${error.message}`);
    throw error;
  }
}
