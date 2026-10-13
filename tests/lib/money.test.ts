import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  formatMoney,
  isCurrencyCode,
  MAX_MINOR_AMOUNT,
  minorToDecimalString,
  parseMoney,
} from "@/lib/money";

describe("money", () => {
  it("knows how many minor digits a currency has", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("BHD")).toBe(3);
  });

  it("accepts only known uppercase ISO 4217 codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("US")).toBe(false);
    expect(isCurrencyCode("ABC")).toBe(false);
  });

  it("parses decimal input into minor units", () => {
    expect(parseMoney("1,250.5", "USD")).toBe(125050);
    expect(parseMoney(" 12 ", "USD")).toBe(1200);
    expect(parseMoney("0.07", "USD")).toBe(7);
    expect(parseMoney("1250", "JPY")).toBe(1250);
    expect(parseMoney("1.234", "BHD")).toBe(1234);
    expect(parseMoney("1,250,000.00", "USD")).toBe(125000000);
  });

  it("accepts commas only as thousands separators", () => {
    expect(parseMoney("12,5", "USD")).toBeNull();
    expect(parseMoney("1,2,3", "USD")).toBeNull();
    expect(parseMoney(",100", "USD")).toBeNull();
  });

  it("rejects malformed, negative, over-precise and oversized input", () => {
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("-1", "USD")).toBeNull();
    expect(parseMoney("1.234", "USD")).toBeNull();
    expect(parseMoney("12.5", "JPY")).toBeNull();
    expect(parseMoney("1e5", "USD")).toBeNull();
    expect(parseMoney(String(MAX_MINOR_AMOUNT), "USD")).toBeNull();
  });

  it("formats minor units for display", () => {
    expect(formatMoney(125050, "USD")).toBe("$1,250.50");
    expect(formatMoney(1250, "JPY")).toBe("¥1,250");
  });

  it("converts minor units back to an input string", () => {
    expect(minorToDecimalString(125050, "USD")).toBe("1250.50");
    expect(minorToDecimalString(1250, "JPY")).toBe("1250");
  });
});
