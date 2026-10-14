import { describe, expect, it } from "vitest";
import { type Quote, safeParseQuote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";

function q(input: Record<string, unknown>): Quote {
  const result = safeParseQuote({ version: 1, currency: "USD", ...input });
  if (!result.ok) throw new Error(result.error);
  return result.quote;
}
const line = (id: string, price: number, qty: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Item ${id}`,
  price,
  qty,
  ...extra,
});

describe("computeQuote", () => {
  it("sums price times quantity", () => {
    const totals = computeQuote(q({ sections: [{ id: "s", items: [line("a", 1000, 2), line("b", 500, 1)] }] }));
    expect(totals.subtotal).toBe(2500);
    expect(totals.total).toBe(2500);
    expect(totals.sections).toEqual([{ sectionId: "s", net: 2500 }]);
    expect(totals.lines.map((l) => l.net)).toEqual([2000, 500]);
  });

  it("applies a rounded percent line discount", () => {
    const totals = computeQuote(
      q({ sections: [{ id: "s", items: [line("a", 1999, 3, { discount: { type: "percent", value: 10 } })] }] }),
    );
    expect(totals.lines[0]).toMatchObject({ base: 5997, discount: 600, net: 5397 });
  });

  it("caps an absolute line discount at the line amount", () => {
    const totals = computeQuote(
      q({ sections: [{ id: "s", items: [line("a", 1000, 1, { discount: { type: "absolute", amount: 5000 } })] }] }),
    );
    expect(totals.lines[0]).toMatchObject({ base: 1000, discount: 1000, net: 0 });
  });

  it("applies the quote discount before tax", () => {
    const totals = computeQuote(
      q({
        sections: [{ id: "s", items: [line("a", 10000, 1)] }],
        discount: { type: "percent", value: 10 },
        tax: { type: "percent", value: 7.25 },
      }),
    );
    expect(totals).toMatchObject({ subtotal: 10000, discount: 1000, tax: 653, total: 9653 });
  });

  it("supports absolute quote discount and tax, capping the discount", () => {
    const totals = computeQuote(
      q({
        sections: [{ id: "s", items: [line("a", 1000, 1)] }],
        discount: { type: "absolute", amount: 9999 },
        tax: { type: "absolute", amount: 250 },
      }),
    );
    expect(totals).toMatchObject({ subtotal: 1000, discount: 1000, tax: 250, total: 250 });
  });

  it("excludes optional lines that are not selected but still prices them", () => {
    const totals = computeQuote(
      q({
        sections: [
          {
            id: "s",
            items: [line("a", 1000, 1), line("b", 400, 1, { optional: true, selected: false }), line("c", 300, 1, { optional: true })],
          },
        ],
      }),
    );
    expect(totals.subtotal).toBe(1300);
    expect(totals.lines[1]).toMatchObject({ included: false, net: 400 });
  });

  it("counts only the selected line of a multichoice section", () => {
    const section = (selected: string | null) => ({
      id: "m",
      kind: "multichoice",
      items: [line("a", 1000, 1, { selected: selected === "a" }), line("b", 2000, 1, { selected: selected === "b" })],
    });
    expect(computeQuote(q({ sections: [section("b")] })).subtotal).toBe(2000);
    expect(computeQuote(q({ sections: [section(null)] })).subtotal).toBe(0);
  });

  it("evaluates custom number, money and formula columns", () => {
    const totals = computeQuote(
      q({
        columns: [
          { id: "hours", label: "Hours", type: "number" },
          { id: "fee", label: "Setup fee", type: "money" },
          { id: "labor", label: "Labor", type: "money", formula: "price * hours" },
        ],
        amountFormula: "labor + fee",
        sections: [{ id: "s", items: [line("a", 15000, 1, { values: { hours: 2.5, fee: 500 } }), line("b", 100, 1)] }],
      }),
    );
    expect(totals.lines.map((l) => l.base)).toEqual([38000, 0]);
  });

  it("keeps zero-decimal currencies in whole units", () => {
    const totals = computeQuote(
      q({ currency: "JPY", sections: [{ id: "s", items: [line("a", 1250, 3)] }], tax: { type: "percent", value: 10 } }),
    );
    expect(totals).toMatchObject({ currency: "JPY", subtotal: 3750, tax: 375, total: 4125 });
  });

  it("rejects a negative line amount, naming the line", () => {
    const quote = q({ amountFormula: "price - 5000", sections: [{ id: "s", items: [line("a", 1000, 1)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError('"Item a" has a negative amount.'));
  });

  it("reports division by zero in a line, naming the line", () => {
    const quote = q({ amountFormula: "price / qty", sections: [{ id: "s", items: [line("a", 1000, 0)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError('"Item a": Division by zero in formula.'));
  });

  it("rejects a quote total above the maximum amount, with every line within it", () => {
    const quote = q({ sections: [{ id: "s", items: [line("a", 600_000_000_000, 1), line("b", 600_000_000_000, 1)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError("The quote total is too large."));
  });

  it("rejects a line amount above the maximum amount, naming the line", () => {
    const quote = q({ sections: [{ id: "s", items: [line("a", 999_999_999_998, 2)] }] });
    expect(() => computeQuote(quote)).toThrow(new QuoteError('"Item a" is too large.'));
  });
});
