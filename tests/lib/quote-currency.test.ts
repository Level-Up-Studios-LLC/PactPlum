import { describe, expect, it } from "vitest";
import { changeQuoteCurrency } from "@/lib/quote/currency";
import { emptyQuote, newQuoteItem, type Quote } from "@/lib/quote/schema";

function build(currency = "USD"): Quote {
  const quote = emptyQuote(currency);
  quote.columns = [
    { id: "setup", label: "Setup fee", type: "money", formula: null },
    { id: "note", label: "Note", type: "text", formula: null },
    { id: "hours", label: "Hours", type: "number", formula: null },
  ];
  quote.sections[0].items = [
    newQuoteItem({
      productId: "prod_1",
      price: 1250,
      qty: 3,
      discount: { type: "absolute", amount: 200 },
      values: { setup: 500, note: "hello", hours: 40 },
    }),
    newQuoteItem({ productId: "prod_2", price: 1000, discount: { type: "percent", value: 10 } }),
  ];
  quote.discount = { type: "absolute", amount: 100 };
  quote.tax = { type: "percent", value: 20 };
  return quote;
}

describe("changeQuoteCurrency", () => {
  it("keeps the same minor amounts when the exponent is unchanged", () => {
    const next = changeQuoteCurrency(build(), "EUR");
    expect(next.currency).toBe("EUR");
    expect(next.sections[0].items[0].price).toBe(1250);
  });

  it("rounds half up when the new currency has fewer decimals", () => {
    const quote = build();
    expect(changeQuoteCurrency(quote, "JPY").sections[0].items[0].price).toBe(13);
  });

  it("scales up when the new currency has more decimals", () => {
    const jpy = build("JPY");
    jpy.sections[0].items[0].price = 1250;
    expect(changeQuoteCurrency(jpy, "USD").sections[0].items[0].price).toBe(125000);
    const usd = build();
    usd.sections[0].items[0].price = 1234;
    expect(changeQuoteCurrency(usd, "BHD").sections[0].items[0].price).toBe(12340);
  });

  it("rescales money columns, absolute line discounts and absolute quote adjustments", () => {
    const next = changeQuoteCurrency(build(), "BHD");
    const item = next.sections[0].items[0];
    expect(item.values.setup).toBe(5000);
    expect(item.discount).toEqual({ type: "absolute", amount: 2000 });
    expect(next.discount).toEqual({ type: "absolute", amount: 1000 });
    const taxed = build();
    taxed.tax = { type: "absolute", amount: 150 };
    expect(changeQuoteCurrency(taxed, "JPY").tax).toEqual({ type: "absolute", amount: 2 });
  });

  it("leaves percentages, quantities and number or text columns alone", () => {
    const next = changeQuoteCurrency(build(), "JPY");
    const [first, second] = next.sections[0].items;
    expect(next.tax).toEqual({ type: "percent", value: 20 });
    expect(second.discount).toEqual({ type: "percent", value: 10 });
    expect(first.qty).toBe(3);
    expect(first.values.hours).toBe(40);
    expect(first.values.note).toBe("hello");
  });

  it("clears catalog links", () => {
    const next = changeQuoteCurrency(build(), "EUR");
    expect(next.sections[0].items.map((item) => item.productId)).toEqual([null, null]);
  });

  it("does not mutate the input", () => {
    const quote = build();
    const snapshot = structuredClone(quote);
    changeQuoteCurrency(quote, "JPY");
    expect(quote).toEqual(snapshot);
  });

  it("returns an equal quote for the same currency", () => {
    const quote = build();
    expect(changeQuoteCurrency(quote, "USD")).toEqual(quote);
  });
});
