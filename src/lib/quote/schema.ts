import { z } from "zod";
import { newId } from "@/lib/ids";
import { isCurrencyCode, MAX_MINOR_AMOUNT } from "@/lib/money";
import { FormulaError, formulaRefs, parseFormula } from "./formula";

export const DEFAULT_AMOUNT_FORMULA = "price * qty";
export const RESERVED_FIELDS = ["price", "qty"] as const;
// Names that would collide with object internals when line values are read by column id.
export const RESERVED_COLUMN_IDS: readonly string[] = [...RESERVED_FIELDS, "__proto__", "constructor", "prototype"];
export const COLUMN_ID_PATTERN = /^[a-z_][a-z0-9_]{0,31}$/;
export const QUOTE_LIMITS = { sections: 50, items: 500, columns: 10 } as const;

const minorAmount = z.number().int().min(0).max(MAX_MINOR_AMOUNT);

export const AdjustmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percent"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("absolute"), amount: minorAmount }),
]);

export const ColumnSchema = z.object({
  id: z.string().regex(COLUMN_ID_PATTERN,"Column ids use lowercase letters, digits and underscores."),
  label: z.string().trim().min(1, "Every column needs a label.").max(60),
  type: z.enum(["text", "number", "money", "percent"]),
  formula: z.string().max(200).nullable().default(null),
});

export const ItemSchema = z.object({
  id: z.string().min(1).max(64),
  productId: z.string().max(64).nullable().default(null),
  name: z.string().trim().min(1, "Every line item needs a name.").max(200),
  description: z.string().max(2000).default(""),
  price: minorAmount,
  qty: z.number().min(0).max(1_000_000),
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
  discount: AdjustmentSchema.nullable().default(null),
  values: z.record(z.string(), z.union([z.string().max(500), z.number()])).default({}),
});

export const SectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(200).default(""),
  kind: z.enum(["standard", "multichoice"]).default("standard"),
  items: z.array(ItemSchema).default([]),
});

export const QuoteSchema = z
  .object({
    version: z.literal(1),
    currency: z.string().refine(isCurrencyCode, "Unknown currency code."),
    amountFormula: z.string().max(200).default(DEFAULT_AMOUNT_FORMULA),
    columns: z.array(ColumnSchema).max(QUOTE_LIMITS.columns).default([]),
    sections: z.array(SectionSchema).max(QUOTE_LIMITS.sections).default([]),
    discount: AdjustmentSchema.nullable().default(null),
    tax: AdjustmentSchema.nullable().default(null),
  })
  .superRefine((quote, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    // Columns: unique, not reserved, formulas only over numeric columns defined earlier.
    const numeric = new Set<string>(RESERVED_FIELDS);
    const seenColumns = new Set<string>();
    for (const column of quote.columns) {
      if (RESERVED_COLUMN_IDS.includes(column.id)) return fail(`Column id "${column.id}" is reserved.`);
      if (seenColumns.has(column.id)) return fail(`Column id "${column.id}" is used twice.`);
      seenColumns.add(column.id);
      if (column.formula !== null) {
        if (column.type === "text") return fail(`Text column "${column.label}" cannot have a formula.`);
        let refs: string[];
        try {
          refs = formulaRefs(parseFormula(column.formula));
        } catch (error) {
          if (error instanceof FormulaError) return fail(`Column "${column.label}": ${error.message}`);
          throw error;
        }
        const bad = refs.find((ref) => !numeric.has(ref));
        if (bad) return fail(`Column "${column.label}" uses "${bad}", which is not a number column defined before it.`);
      }
      if (column.type !== "text") numeric.add(column.id);
    }

    try {
      const bad = formulaRefs(parseFormula(quote.amountFormula)).find((ref) => !numeric.has(ref));
      if (bad) return fail(`The amount formula uses "${bad}", which is not a number column.`);
    } catch (error) {
      if (error instanceof FormulaError) return fail(`Amount formula: ${error.message}`);
      throw error;
    }

    // Sections and items: unique ids, item limit, one selection per multichoice section.
    const sectionIds = new Set<string>();
    const itemIds = new Set<string>();
    let itemCount = 0;
    for (const section of quote.sections) {
      if (sectionIds.has(section.id)) return fail(`Section id "${section.id}" is used twice.`);
      sectionIds.add(section.id);
      if (section.kind === "multichoice" && section.items.filter((item) => item.selected).length > 1) {
        return fail("A multichoice section can have only one selected item.");
      }
      for (const item of section.items) {
        if (itemIds.has(item.id)) return fail(`Line item id "${item.id}" is used twice.`);
        itemIds.add(item.id);
        itemCount++;
      }
    }
    if (itemCount > QUOTE_LIMITS.items) fail(`A quote can have at most ${QUOTE_LIMITS.items} line items.`);
  });

export type Adjustment = z.output<typeof AdjustmentSchema>;
export type QuoteColumn = z.output<typeof ColumnSchema>;
export type QuoteItem = z.output<typeof ItemSchema>;
export type QuoteSection = z.output<typeof SectionSchema>;
export type Quote = z.output<typeof QuoteSchema>;

export function safeParseQuote(input: unknown): { ok: true; quote: Quote } | { ok: false; error: string } {
  const result = QuoteSchema.safeParse(input);
  if (result.success) return { ok: true, quote: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "The pricing table is not valid." };
}

export function newQuoteItem(input: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: newId(),
    productId: null,
    name: "New item",
    description: "",
    price: 0,
    qty: 1,
    optional: false,
    selected: true,
    discount: null,
    values: {},
    ...input,
  };
}

export function newQuoteSection(): QuoteSection {
  return { id: newId(), title: "", kind: "standard", items: [] };
}

export function emptyQuote(currency: string): Quote {
  return {
    version: 1,
    currency,
    amountFormula: DEFAULT_AMOUNT_FORMULA,
    columns: [],
    sections: [newQuoteSection()],
    discount: null,
    tax: null,
  };
}
