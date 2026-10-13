import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, formulaRefs, parseFormula } from "@/lib/quote/formula";

const run = (source: string, values: Record<string, number> = {}) => evaluateFormula(parseFormula(source), values);

describe("formula evaluator", () => {
  it("follows arithmetic precedence and parentheses", () => {
    expect(run("2 + 3 * 4")).toBe(14);
    expect(run("(2 + 3) * 4")).toBe(20);
    expect(run("10 - 4 - 3")).toBe(3);
    expect(run("12 / 4 / 3")).toBe(1);
    expect(run("-2 * -3")).toBe(6);
    expect(run("price * 1.5", { price: 1000 })).toBe(1500);
  });

  it("evaluates column references", () => {
    expect(run("price * qty", { price: 1999, qty: 3 })).toBe(5997);
    expect(run("rate * hours + fee", { rate: 15000, hours: 2.5, fee: 500 })).toBe(38000);
  });

  it("lists the columns a formula references", () => {
    expect(formulaRefs(parseFormula("rate * hours + rate"))).toEqual(["rate", "hours"]);
  });

  it.each([
    ["", "Formula is empty."],
    ["price *", "Formula ends unexpectedly."],
    ["price + * qty", 'Unexpected "*" in formula.'],
    ["(price", "Missing closing parenthesis."],
    ["price)", 'Unexpected ")" in formula.'],
    ["process.exit()", 'Unexpected character "." in formula.'],
    ["Price", 'Unexpected character "P" in formula.'],
    ["a".repeat(201), "Formula is longer than 200 characters."],
    ["(".repeat(40) + "1" + ")".repeat(40), "Formula is nested too deeply."],
  ])("rejects %j with a readable message", (source, message) => {
    expect(() => parseFormula(source)).toThrow(new FormulaError(message));
  });

  it("rejects unknown columns, including inherited object properties", () => {
    expect(() => run("constructor")).toThrow(new FormulaError('Unknown column "constructor".'));
    expect(() => run("__proto__ * 2")).toThrow(new FormulaError('Unknown column "__proto__".'));
    expect(() => run("missing + 1", { price: 1 })).toThrow(new FormulaError('Unknown column "missing".'));
  });

  it("rejects division by zero", () => {
    expect(() => run("price / qty", { price: 100, qty: 0 })).toThrow(new FormulaError("Division by zero in formula."));
  });
});
