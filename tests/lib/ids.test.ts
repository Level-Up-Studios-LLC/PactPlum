import { describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("returns distinct non-empty ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    // Shadow the method with an own property, then delete it to restore the original.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      delete (crypto as unknown as Record<string, unknown>).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe("function");
  });
});
