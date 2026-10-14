import { describe, expect, it } from "vitest";
import { parseRoleList } from "@/lib/roles";

describe("parseRoleList", () => {
  it("splits on commas, trims and drops empty names", () => {
    expect(parseRoleList(" Client, Agency ,, ")).toEqual(["Client", "Agency"]);
    expect(parseRoleList("")).toEqual([]);
  });
});
