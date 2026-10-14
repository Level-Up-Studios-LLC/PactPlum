import { describe, expect, it } from "vitest";
import { emptyQuote, safeParseQuote } from "@/lib/quote/schema";

const item = (overrides: Record<string, unknown> = {}) => ({ id: "i1", name: "Design", price: 1000, qty: 1, ...overrides });
const quote = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  currency: "USD",
  sections: [{ id: "s1", items: [item()] }],
  ...overrides,
});
const errorOf = (input: unknown) => {
  const result = safeParseQuote(input);
  if (result.ok) throw new Error("expected a validation error");
  return result.error;
};

describe("quote schema", () => {
  it("fills defaults for a minimal quote", () => {
    const result = safeParseQuote({ version: 1, currency: "EUR" });
    expect(result).toEqual({
      ok: true,
      quote: { version: 1, currency: "EUR", amountFormula: "price * qty", columns: [], sections: [], discount: null, tax: null },
    });
  });

  it("builds an empty quote with one section", () => {
    const q = emptyQuote("JPY");
    expect(q.currency).toBe("JPY");
    expect(q.sections).toHaveLength(1);
    expect(q.sections[0].items).toEqual([]);
    expect(safeParseQuote(q).ok).toBe(true);
  });

  it("rejects an unknown currency", () => {
    expect(errorOf(quote({ currency: "ABC" }))).toBe("Unknown currency code.");
  });

  it("requires a name on every line item", () => {
    expect(errorOf(quote({ sections: [{ id: "s1", items: [item({ name: " " })] }] }))).toBe("Every line item needs a name.");
  });

  it("rejects fractional or negative prices", () => {
    expect(safeParseQuote(quote({ sections: [{ id: "s1", items: [item({ price: 10.5 })] }] })).ok).toBe(false);
    expect(safeParseQuote(quote({ sections: [{ id: "s1", items: [item({ price: -1 })] }] })).ok).toBe(false);
  });

  it("rejects a percent above 100", () => {
    expect(safeParseQuote(quote({ tax: { type: "percent", value: 101 } })).ok).toBe(false);
  });

  it("rejects reserved and duplicate column ids", () => {
    expect(errorOf(quote({ columns: [{ id: "price", label: "Price", type: "money" }] }))).toBe(
      'Column id "price" is reserved.',
    );
    expect(
      errorOf(quote({ columns: [{ id: "hours", label: "Hours", type: "number" }, { id: "hours", label: "H", type: "number" }] })),
    ).toBe('Column id "hours" is used twice.');
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects the object-prototype column id %s", (id) => {
    expect(errorOf(quote({ columns: [{ id, label: "Odd", type: "number" }] }))).toBe(`Column id "${id}" is reserved.`);
  });

  it("rejects formulas on text columns and references to later or text columns", () => {
    expect(errorOf(quote({ columns: [{ id: "note", label: "Note", type: "text", formula: "price" }] }))).toBe(
      'Text column "Note" cannot have a formula.',
    );
    expect(
      errorOf(
        quote({
          columns: [
            { id: "total_hours", label: "Total", type: "number", formula: "hours * 2" },
            { id: "hours", label: "Hours", type: "number" },
          ],
        }),
      ),
    ).toBe('Column "Total" uses "hours", which is not a number column defined before it.');
    expect(
      errorOf(quote({ columns: [{ id: "note", label: "Note", type: "text" }], amountFormula: "price * note" })),
    ).toBe('The amount formula uses "note", which is not a number column.');
  });

  it("reports formula syntax errors", () => {
    expect(errorOf(quote({ amountFormula: "price *" }))).toBe("Amount formula: Formula ends unexpectedly.");
  });

  it("allows at most one selected item in a multichoice section", () => {
    const section = { id: "s1", kind: "multichoice", items: [item({ id: "a" }), item({ id: "b" })] };
    expect(errorOf(quote({ sections: [section] }))).toBe("A multichoice section can have only one selected item.");
  });

  it("rejects duplicate item ids", () => {
    expect(errorOf(quote({ sections: [{ id: "s1", items: [item(), item()] }] }))).toBe('Line item id "i1" is used twice.');
  });
});
