import { COLUMN_ID_PATTERN, RESERVED_COLUMN_IDS, type Quote, type QuoteItem } from "./schema";

// Same token shapes as the formula tokenizer: numbers first, so "2x" is the number 2 then the identifier x.
const FORMULA_TOKEN = /\d+(?:\.\d+)?|[a-z_][a-z0-9_]*/g;

export function nextColumnId(columns: { id: string }[]): string {
  const used = new Set(columns.map((column) => column.id));
  let number = 1;
  while (used.has(`col_${number}`)) number++;
  return `col_${number}`;
}

// Returns why `id` cannot be given to the column currently called `current`, or null when it is fine.
export function columnIdProblem(quote: Quote, current: string, id: string): string | null {
  if (!COLUMN_ID_PATTERN.test(id)) {
    return "Use lowercase letters, digits and underscores, starting with a letter or underscore (32 characters at most).";
  }
  if (RESERVED_COLUMN_IDS.includes(id)) return "That id is reserved.";
  if (id !== current && quote.columns.some((column) => column.id === id)) return "That id is already used.";
  return null;
}

// Rewrites whole-identifier references only, so renaming "a" leaves "a_x" alone, and every other character stays as typed.
function renameInFormula(formula: string, from: string, to: string): string {
  return formula.replace(FORMULA_TOKEN, (token) => (token === from ? to : token));
}

function mapItems(quote: Quote, change: (item: QuoteItem) => QuoteItem): Quote["sections"] {
  return quote.sections.map((section) => ({ ...section, items: section.items.map(change) }));
}

export function renameColumn(quote: Quote, from: string, to: string): Quote {
  if (from === to) return quote;
  const problem = columnIdProblem(quote, from, to);
  if (problem) throw new Error(problem);
  return {
    ...quote,
    amountFormula: renameInFormula(quote.amountFormula, from, to),
    columns: quote.columns.map((column) => ({
      ...column,
      id: column.id === from ? to : column.id,
      formula: column.formula === null ? null : renameInFormula(column.formula, from, to),
    })),
    sections: mapItems(quote, (item) => {
      const values = { ...item.values };
      delete values[from];
      delete values[to];
      if (Object.hasOwn(item.values, from)) values[to] = item.values[from];
      return { ...item, values };
    }),
  };
}

// Formula references to the removed id are left alone on purpose: validation then reports the broken formula.
export function removeColumn(quote: Quote, id: string): Quote {
  return {
    ...quote,
    columns: quote.columns.filter((column) => column.id !== id),
    sections: mapItems(quote, (item) => {
      const values = { ...item.values };
      delete values[id];
      return { ...item, values };
    }),
  };
}
