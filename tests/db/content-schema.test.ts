import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contacts, documents, organizations, products, recipients } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let orgA: string;
let orgB: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const rows = await db
    .insert(organizations)
    .values([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ])
    .returning({ id: organizations.id });
  [orgA, orgB] = rows.map((row) => row.id);
});
afterEach(async () => {
  await close();
});

const contact = (organizationId: string, email = "jane@acme.com") => ({ organizationId, name: "Jane", email });
const product = (organizationId: string, extra: Record<string, unknown> = {}) => ({
  organizationId,
  title: "Design",
  unitPrice: 1000,
  currency: "USD",
  ...extra,
});
const document = (organizationId: string, number = "P-0001", extra: Record<string, unknown> = {}) => ({
  organizationId,
  type: "proposal" as const,
  name: "Proposal",
  number,
  content: emptyContent(),
  currency: "USD",
  ...extra,
});

describe("contacts constraints", () => {
  it("rejects an email that is not lowercase and trimmed", async () => {
    await expect(db.insert(contacts).values(contact(orgA, "Jane@Acme.com"))).rejects.toThrow();
  });

  it("allows one contact per email per organization", async () => {
    await db.insert(contacts).values(contact(orgA));
    await expect(db.insert(contacts).values(contact(orgA))).rejects.toThrow();
    await expect(db.insert(contacts).values(contact(orgB))).resolves.toBeDefined();
  });
});

describe("products constraints", () => {
  it("rejects negative prices and malformed currency codes", async () => {
    await expect(db.insert(products).values(product(orgA, { unitPrice: -1 }))).rejects.toThrow();
    await expect(db.insert(products).values(product(orgA, { currency: "usd" }))).rejects.toThrow();
  });

  it("stores amounts above the 32-bit integer range", async () => {
    const [row] = await db.insert(products).values(product(orgA, { unitPrice: 500_000_000_000 })).returning();
    expect(row.unitPrice).toBe(500_000_000_000);
  });

  it("keeps SKUs unique per organization but allows many products without one", async () => {
    await db.insert(products).values([product(orgA), product(orgA)]);
    await db.insert(products).values(product(orgA, { sku: "WEB-1" }));
    await expect(db.insert(products).values(product(orgA, { sku: "WEB-1" }))).rejects.toThrow();
    await expect(db.insert(products).values(product(orgB, { sku: "WEB-1" }))).resolves.toBeDefined();
  });
});

describe("documents constraints", () => {
  it("keeps document numbers unique per organization", async () => {
    await db.insert(documents).values(document(orgA));
    await expect(db.insert(documents).values(document(orgA))).rejects.toThrow();
    await expect(db.insert(documents).values(document(orgB))).resolves.toBeDefined();
  });

  it("requires a percent for deposit payments and keeps it between 1 and 100", async () => {
    await expect(db.insert(documents).values(document(orgA, "P-1", { paymentMode: "deposit_percent" }))).rejects.toThrow();
    await expect(
      db.insert(documents).values(document(orgA, "P-2", { paymentMode: "deposit_percent", paymentPercent: 101 })),
    ).rejects.toThrow();
    await expect(
      db.insert(documents).values(document(orgA, "P-3", { paymentMode: "deposit_percent", paymentPercent: 30 })),
    ).resolves.toBeDefined();
  });

  it("defaults to draft with no payment and a zero total", async () => {
    const [row] = await db.insert(documents).values(document(orgA)).returning();
    expect(row).toMatchObject({ status: "draft", paymentMode: "off", total: 0, roles: ["Client"], variables: {} });
  });
});

describe("recipients constraints", () => {
  async function seedDocument() {
    const [c] = await db.insert(contacts).values(contact(orgA)).returning();
    const [d] = await db.insert(documents).values(document(orgA, "P-0001", { contactId: c.id })).returning();
    return { contactId: c.id, documentId: d.id };
  }
  const recipient = (documentId: string, extra: Record<string, unknown> = {}) => ({
    organizationId: orgA,
    documentId,
    name: "Jane",
    email: "jane@acme.com",
    role: "Client",
    ...extra,
  });

  it("requires a role for signers but not for copies", async () => {
    const { documentId } = await seedDocument();
    await expect(db.insert(recipients).values(recipient(documentId, { role: null }))).rejects.toThrow();
    await expect(
      db.insert(recipients).values(recipient(documentId, { role: null, kind: "cc", email: "cc@acme.com" })),
    ).resolves.toBeDefined();
  });

  it("allows one recipient per role and per email on a document", async () => {
    const { documentId } = await seedDocument();
    await db.insert(recipients).values(recipient(documentId));
    await expect(db.insert(recipients).values(recipient(documentId, { email: "other@acme.com" }))).rejects.toThrow();
    await expect(db.insert(recipients).values(recipient(documentId, { role: "Agency" }))).rejects.toThrow();
  });

  it("keeps documents and recipients when their contact is deleted", async () => {
    const { contactId, documentId } = await seedDocument();
    await db.insert(recipients).values(recipient(documentId, { contactId }));
    await db.delete(contacts).where(eq(contacts.id, contactId));
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    const [rec] = await db.select().from(recipients).where(eq(recipients.documentId, documentId));
    expect(doc.contactId).toBeNull();
    expect(rec).toMatchObject({ contactId: null, name: "Jane", email: "jane@acme.com" });
  });
});
