import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import type { OrgContext } from "@/server/tenancy";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

export async function insertUser(db: Db, email: string, name = "Test User"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.user).values({ id, email, name, emailVerified: true });
  return id;
}

/** Organization A has an owner (a) and a member (aMember); organization B has an owner (b). */
export async function seedTwoOrganizations(
  db: Db,
): Promise<{ a: OrgContext; aMember: OrgContext; b: OrgContext }> {
  const orgs = await db
    .insert(schema.organizations)
    .values([
      { slug: "org-a", name: "Org A" },
      { slug: "org-b", name: "Org B" },
    ])
    .returning({ id: schema.organizations.id, slug: schema.organizations.slug });
  const orgA = orgs.find((org) => org.slug === "org-a")!.id;
  const orgB = orgs.find((org) => org.slug === "org-b")!.id;
  const alice = await insertUser(db, "alice@a.test", "Alice");
  const amy = await insertUser(db, "amy@a.test", "Amy");
  const bob = await insertUser(db, "bob@b.test", "Bob");
  await db.insert(schema.members).values([
    { organizationId: orgA, userId: alice, role: "owner" },
    { organizationId: orgA, userId: amy, role: "member" },
    { organizationId: orgB, userId: bob, role: "owner" },
  ]);
  return {
    a: { organizationId: orgA, userId: alice, role: "owner" },
    aMember: { organizationId: orgA, userId: amy, role: "member" },
    b: { organizationId: orgB, userId: bob, role: "owner" },
  };
}
