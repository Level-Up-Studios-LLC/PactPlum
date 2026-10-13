import { describe, expect, it } from "vitest";
import { APP_LICENSE, APP_NAME } from "@/lib/app-info";

describe("app info", () => {
  it("names the product and its license", () => {
    expect(APP_NAME).toBe("PactPlum");
    expect(APP_LICENSE).toBe("MIT");
  });
});
