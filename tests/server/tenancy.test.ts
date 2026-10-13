import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError } from "@/server/errors";
import { listMembers } from "@/server/org/members";
import { assertOwner, getOrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

async function seedTwoOrganizations() {
  const [orgA] = await db.insert(organizations).values({ slug: "a", name: "Org A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: "b", name: "Org B" }).returning();
  const alice = await insertUser(db, "alice@a.com", "Alice");
  const bob = await insertUser(db, "bob@b.com", "Bob");
  await db.insert(members).values([
    { organizationId: orgA.id, userId: alice, role: "owner" },
    { organizationId: orgB.id, userId: bob, role: "owner" },
  ]);
  return { orgA, orgB, alice, bob };
}

describe("tenancy", () => {
  it("resolves the organization context for a member", async () => {
    const { orgA, alice } = await seedTwoOrganizations();
    expect(await getOrgContext(db, alice)).toEqual({ organizationId: orgA.id, userId: alice, role: "owner" });
  });

  it("returns null for a user without membership", async () => {
    const stranger = await insertUser(db, "stranger@x.com");
    expect(await getOrgContext(db, stranger)).toBeNull();
  });

  it("never lists members of another organization", async () => {
    const { alice } = await seedTwoOrganizations();
    const ctx = (await getOrgContext(db, alice))!;
    const result = await listMembers(db, ctx);
    expect(result.map((m) => m.email)).toEqual(["alice@a.com"]);
  });

  it("assertOwner rejects members", () => {
    expect(() => assertOwner({ organizationId: "o", userId: "u", role: "member" })).toThrow(ForbiddenError);
    expect(() => assertOwner({ organizationId: "o", userId: "u", role: "owner" })).not.toThrow();
  });
});
