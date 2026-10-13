import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureOrganization } from "@/server/org/bootstrap";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

describe("ensureOrganization", () => {
  it("creates the default organization once and returns the same id", async () => {
    const first = await ensureOrganization(db, "Acme");
    const second = await ensureOrganization(db, "Other name");
    expect(second).toBe(first);
    const rows = await db.select().from(organizations);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Acme");
    expect(rows[0].allowedSignupDomains).toEqual([]);
  });
});

describe("members constraints", () => {
  it("allows only one owner per organization", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    const b = await insertUser(db, "b@example.com");
    await db.insert(members).values({ organizationId, userId: a, role: "owner" });
    await expect(
      db.insert(members).values({ organizationId, userId: b, role: "owner" }),
    ).rejects.toThrow();
  });

  it("allows many members alongside the owner", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    const b = await insertUser(db, "b@example.com");
    const c = await insertUser(db, "c@example.com");
    await db.insert(members).values([
      { organizationId, userId: a, role: "owner" },
      { organizationId, userId: b, role: "member" },
      { organizationId, userId: c, role: "member" },
    ]);
    expect(await db.select().from(members)).toHaveLength(3);
  });

  it("prevents the same user joining an organization twice", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    await db.insert(members).values({ organizationId, userId: a, role: "member" });
    await expect(
      db.insert(members).values({ organizationId, userId: a, role: "member" }),
    ).rejects.toThrow();
  });
});
