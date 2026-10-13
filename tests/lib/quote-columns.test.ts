import { describe, expect, it } from "vitest";
import { columnIdProblem, nextColumnId, removeColumn, renameColumn } from "@/lib/quote/columns";
import { emptyQuote, newQuoteItem, safeParseQuote, type Quote } from "@/lib/quote/schema";

function build(): Quote {
  const quote = emptyQuote("USD");
  quote.columns = [
    { id: "hours", label: "Hours", type: "number", formula: null },
    { id: "hours_x", label: "Hours x", type: "number", formula: null },
    { id: "cost", label: "Cost", type: "number", formula: "hours * 2 + hours_x" },
    { id: "note", label: "Note", type: "text", formula: null },
  ];
  quote.amountFormula = "price * qty + hours*cost - hours_x";
  quote.sections[0].items = [
    newQuoteItem({ values: { hours: 4, hours_x: 1, note: "a" } }),
    newQuoteItem({ values: { hours: 8 } }),
  ];
  return quote;
}

describe("renameColumn", () => {
  it("moves line values to the new id in every item", () => {
    const next = renameColumn(build(), "hours", "time");
    expect(next.columns.map((column) => column.id)).toEqual(["time", "hours_x", "cost", "note"]);
    expect(next.sections[0].items.map((item) => item.values)).toEqual([{ time: 4, hours_x: 1, note: "a" }, { time: 8 }]);
  });

  it("rewrites references in the amount formula and in column formulas, keeping spacing", () => {
    const next = renameColumn(build(), "hours", "time");
    expect(next.amountFormula).toBe("price * qty + time*cost - hours_x");
    expect(next.columns[2].formula).toBe("time * 2 + hours_x");
  });

  it("matches whole identifiers only", () => {
    const quote = build();
    quote.amountFormula = "price * hours_x + hours + 2*hours";
    const next = renameColumn(quote, "hours", "h");
    expect(next.amountFormula).toBe("price * hours_x + h + 2*h");
    expect(renameColumn(quote, "price", "p").amountFormula).toBe("p * hours_x + hours + 2*hours");
  });

  it("keeps the result valid", () => {
    expect(safeParseQuote(renameColumn(build(), "hours", "time")).ok).toBe(true);
  });

  it("drops a stale value already stored under the new id", () => {
    const quote = build();
    quote.sections[0].items[1].values = { time: 99 };
    expect(renameColumn(quote, "hours", "time").sections[0].items[1].values).toEqual({});
  });

  it("returns the quote as is when the id does not change", () => {
    const quote = build();
    expect(renameColumn(quote, "hours", "hours")).toBe(quote);
  });

  it("does not mutate its input", () => {
    const quote = build();
    const snapshot = structuredClone(quote);
    const next = renameColumn(quote, "hours", "time");
    expect(quote).toEqual(snapshot);
    expect(next).not.toBe(quote);
    expect(next.sections[0].items[0]).not.toBe(quote.sections[0].items[0]);
  });
});

describe("removeColumn", () => {
  it("removes the column and its values from every item", () => {
    const next = removeColumn(build(), "hours");
    expect(next.columns.map((column) => column.id)).toEqual(["hours_x", "cost", "note"]);
    expect(next.sections[0].items.map((item) => item.values)).toEqual([{ hours_x: 1, note: "a" }, {}]);
  });

  it("leaves formulas alone so validation shows them as broken", () => {
    const next = removeColumn(build(), "hours");
    expect(next.amountFormula).toBe("price * qty + hours*cost - hours_x");
    expect(next.columns[1].formula).toBe("hours * 2 + hours_x");
    expect(safeParseQuote(next)).toMatchObject({ ok: false });
  });

  it("does not mutate its input", () => {
    const quote = build();
    const snapshot = structuredClone(quote);
    removeColumn(quote, "hours");
    expect(quote).toEqual(snapshot);
  });

  it("brings no stale values back when the id is reused", () => {
    const quote = emptyQuote("USD");
    quote.columns = [{ id: "col_1", label: "Column 1", type: "number", formula: null }];
    quote.sections[0].items = [newQuoteItem({ values: { col_1: 7 } })];
    const removed = removeColumn(quote, "col_1");
    const id = nextColumnId(removed.columns);
    expect(id).toBe("col_1");
    const added = { ...removed, columns: [...removed.columns, { id, label: "Column 1", type: "number" as const, formula: null }] };
    expect(added.sections[0].items[0].values[id]).toBeUndefined();
  });
});

describe("nextColumnId", () => {
  it("picks the first unused col_ number", () => {
    expect(nextColumnId([])).toBe("col_1");
    expect(nextColumnId([{ id: "col_1" }, { id: "col_3" }])).toBe("col_2");
  });
});

describe("columnIdProblem", () => {
  const quote = build();

  it("accepts a free, valid id and the column's own id", () => {
    expect(columnIdProblem(quote, "hours", "time")).toBeNull();
    expect(columnIdProblem(quote, "hours", "hours")).toBeNull();
  });

  it.each(["", "Time", "1abc", "a-b", "x".repeat(33)])("rejects the invalid id %j", (id) => {
    expect(columnIdProblem(quote, "hours", id)).toMatch(/^Use lowercase/);
  });

  it.each(["price", "qty", "__proto__", "constructor", "prototype"])("rejects the reserved id %s", (id) => {
    expect(columnIdProblem(quote, "hours", id)).toBe("That id is reserved.");
  });

  it("rejects another column's id", () => {
    expect(columnIdProblem(quote, "hours", "note")).toBe("That id is already used.");
  });
});
