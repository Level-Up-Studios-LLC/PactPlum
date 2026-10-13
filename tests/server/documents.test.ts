import type { JSONContent } from "@tiptap/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyContent } from "@/lib/editor/content";
import { emptyQuote } from "@/lib/quote/schema";
import { createContact } from "@/server/contacts/contacts";
import {
  createDocument,
  deleteDocument,
  documentVariableValues,
  getDocument,
  listDocuments,
  updateDocument,
} from "@/server/documents/documents";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createTemplate, updateTemplate } from "@/server/templates/templates";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let aMember: OrgContext;
let b: OrgContext;
let templateId: string;
let contactId: string;

const content: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Dear [Client.Name]," }] },
    { type: "quoteBlock" },
    { type: "paragraph", content: [{ type: "field", attrs: { id: "f1", kind: "signature", role: "Client", required: true, label: "" } }] },
  ],
};
const pricedQuote = (qty = 1, currency = "USD") => ({
  ...emptyQuote(currency),
  sections: [{ id: "s1", title: "", kind: "standard", items: [{ id: "i1", name: "Design", price: 100000, qty }] }],
});

// Saves on top of the stored version, like a page that was just loaded.
async function save(ctx: OrgContext, id: string, input: object) {
  return updateDocument(db, ctx, id, { ...input, version: (await getDocument(db, a, id)).version });
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, aMember, b } = await seedTwoOrganizations(db));
  const template = await createTemplate(db, a, { name: "Website proposal" });
  await updateTemplate(db, a, template.id, {
    version: template.version,
    roles: ["Client", "Agency"],
    content,
    quote: pricedQuote(),
    paymentMode: "deposit_percent",
    paymentPercent: 30,
  });
  templateId = template.id;
  contactId = (await createContact(db, a, { name: "Jane Doe", email: "jane@acme.com" })).id;
});
afterEach(async () => {
  await close();
});

describe("createDocument", () => {
  it("creates a draft from a template for a contact", async () => {
    const created = await createDocument(db, aMember, { templateId, contactId });
    const document = await getDocument(db, a, created.id);
    expect(document).toMatchObject({
      organizationId: a.organizationId,
      type: "proposal",
      name: "Website proposal",
      number: "P-0001",
      status: "draft",
      templateId,
      contactId,
      createdByUserId: aMember.userId,
      roles: ["Client", "Agency"],
      content,
      currency: "USD",
      total: 100000,
      paymentMode: "deposit_percent",
      paymentPercent: 30,
    });
    expect(document.quote?.sections[0].items[0].price).toBe(100000);
    expect(document.recipients).toMatchObject([
      { contactId, name: "Jane Doe", email: "jane@acme.com", role: "Client", kind: "signer", ordering: 1 },
    ]);
  });

  it("starts a blank invoice with an empty pricing table in the organization currency", async () => {
    const created = await createDocument(db, a, { type: "invoice" });
    const document = await getDocument(db, a, created.id);
    expect(document).toMatchObject({ name: "New invoice", number: "INV-0001", total: 0, currency: "USD", recipients: [] });
    expect(document.quote?.currency).toBe("USD");
    expect(document.content).toEqual(emptyContent("New invoice"));
  });

  it("starts a blank proposal without a pricing table", async () => {
    const created = await createDocument(db, a, { type: "proposal", name: "Custom name" });
    expect(created).toMatchObject({ name: "Custom name", quote: null, total: 0 });
  });

  it("numbers each type and organization separately and in sequence", async () => {
    const numbers = [];
    for (const type of ["proposal", "proposal", "quote", "invoice"]) numbers.push((await createDocument(db, a, { type })).number);
    expect(numbers).toEqual(["P-0001", "P-0002", "Q-0001", "INV-0001"]);
    expect((await createDocument(db, b, { type: "proposal" })).number).toBe("P-0001");
  });

  it("gives documents created at the same time distinct numbers", async () => {
    const created = await Promise.all(Array.from({ length: 5 }, () => createDocument(db, a, { type: "contract" })));
    expect(created.map((d) => d.number).sort()).toEqual(["C-0001", "C-0002", "C-0003", "C-0004", "C-0005"]);
  });

  it("refuses another organization's template or contact without using a number", async () => {
    await expect(createDocument(db, b, { templateId })).rejects.toThrow(new NotFoundError("Template not found."));
    await expect(createDocument(db, b, { contactId })).rejects.toThrow(new NotFoundError("Contact not found."));
    expect((await createDocument(db, b, {})).number).toBe("P-0001");
  });

  it("treats blank form ids as none", async () => {
    const created = await createDocument(db, a, { type: "contract", templateId: "", contactId: "" });
    expect(created).toMatchObject({ templateId: null, contactId: null, name: "New contract" });
  });
});

describe("updateDocument", () => {
  it("recomputes the total and currency from the pricing table and ignores client-sent totals", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    const updated = await save(a, id, { quote: pricedQuote(3, "EUR"), total: 1, currency: "JPY" });
    expect(updated).toMatchObject({ total: 300000, currency: "EUR" });
    const cleared = await save(a, id, { quote: null });
    expect(cleared).toMatchObject({ total: 0, currency: "EUR", quote: null });
  });

  it("stores trimmed custom variables and combines them with automatic values", async () => {
    const { id } = await createDocument(db, aMember, { templateId, contactId });
    const updated = await save(a, id, { variables: { "Deal.Value": " Gold ", "Deal.Empty": " " } });
    expect(updated.variables).toEqual({ "Deal.Value": "Gold" });
    const values = await documentVariableValues(db, a, updated);
    expect(values).toMatchObject({
      "Client.Name": "Jane Doe",
      "Sender.Name": "Amy",
      "Organization.Name": "Org A",
      "Document.Number": "P-0001",
      "Document.Total": "$1,000.00",
      "Deal.Value": "Gold",
    });
  });

  it.each([
    [{ variables: { deal: "x" } }, "Variable names look like Group.Name."],
    [{ name: "" }, "Name is required."],
    [{ content: { type: "doc", content: [{ type: "script" }] } }, "Document content is not valid."],
    [{ paymentMode: "deposit_percent", paymentPercent: null }, "Enter a deposit percent between 1 and 100."],
  ])("rejects invalid updates %#", async (input, message) => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(save(a, id, input)).rejects.toThrow(new ValidationError(message));
  });

  it("refuses to remove a role that a recipient holds", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(save(a, id, { roles: ["Agency"] })).rejects.toThrow(
      new ValidationError('Remove the recipient Jane Doe or give them another role before removing the role "Client".'),
    );
  });

  it("changes the client contact only to one in the same organization", async () => {
    const { id } = await createDocument(db, a, { templateId });
    expect((await save(a, id, { contactId })).contactId).toBe(contactId);
    const other = await createContact(db, b, { name: "Bob", email: "bob@globex.com" });
    await expect(save(a, id, { contactId: other.id })).rejects.toThrow(NotFoundError);
    expect((await save(a, id, { contactId: null })).contactId).toBeNull();
  });

  it("edits and deletes drafts only", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, id));
    await expect(save(a, id, { name: "Changed" })).rejects.toThrow(
      new ValidationError("Only draft documents can be edited."),
    );
    await expect(deleteDocument(db, a, id)).rejects.toThrow(new ValidationError("Only draft documents can be edited."));
  });

  it("saves on the current version and increments it", async () => {
    const created = await createDocument(db, a, { templateId });
    expect(created.version).toBe(1);
    const first = await updateDocument(db, a, created.id, { version: 1, name: "First" });
    expect(first).toMatchObject({ name: "First", version: 2 });
    const second = await updateDocument(db, a, created.id, { version: 2, name: "Second" });
    expect(second).toMatchObject({ name: "Second", version: 3 });
    expect((await getDocument(db, a, created.id)).version).toBe(3);
  });

  it("refuses a stale version and changes nothing", async () => {
    const { id } = await createDocument(db, a, { templateId });
    const newContent = { ...content, content: [{ type: "paragraph", content: [{ type: "text", text: "Teammate edit" }] }] };
    await updateDocument(db, a, id, { version: 1, content: newContent });
    await expect(updateDocument(db, aMember, id, { version: 1, name: "From an old page" })).rejects.toThrow(
      new ConflictError(
        "Someone else saved this document since you opened it. Reload the page to see their changes, then make your edits again.",
      ),
    );
    const stored = await getDocument(db, a, id);
    expect(stored).toMatchObject({ name: "Website proposal", version: 2 });
    expect(stored.content).toEqual(newContent);
  });

  it("requires a positive integer version", async () => {
    const { id } = await createDocument(db, a, { templateId });
    for (const version of [undefined, 0, -1, 1.5, "1"]) {
      await expect(updateDocument(db, a, id, { version, name: "X" })).rejects.toThrow(
        new ValidationError("Reload the page and try again."),
      );
    }
  });

  it("gives the draft error, not a conflict, for a document that is no longer a draft", async () => {
    const { id } = await createDocument(db, a, { templateId });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, id));
    await expect(updateDocument(db, a, id, { version: 99, name: "Changed" })).rejects.toThrow(
      new ValidationError("Only draft documents can be edited."),
    );
  });

  it("deletes a draft with its recipients", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await deleteDocument(db, a, id);
    await expect(getDocument(db, a, id)).rejects.toThrow(NotFoundError);
  });
});

describe("listing and isolation", () => {
  it("lists documents with the client name, filtered by status and type", async () => {
    await createDocument(db, a, { templateId, contactId });
    const invoice = await createDocument(db, a, { type: "invoice" });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, invoice.id));
    expect((await listDocuments(db, a)).rows.map((d) => [d.number, d.contactName])).toEqual(
      expect.arrayContaining([
        ["P-0001", "Jane Doe"],
        ["INV-0001", null],
      ]),
    );
    expect((await listDocuments(db, a, { status: "sent" })).rows.map((d) => d.number)).toEqual(["INV-0001"]);
    expect((await listDocuments(db, a, { type: "proposal" })).rows.map((d) => d.number)).toEqual(["P-0001"]);
  });

  describe("paging and search", () => {
    // Document k was updated k minutes after the first, so newest-first order is the reverse of insertion.
    const insertMany = async (ctx: OrgContext, count: number, name = (k: number) => `Doc ${k}`) => {
      const start = Date.UTC(2026, 0, 1);
      await db.insert(documents).values(
        Array.from({ length: count }, (_, k) => ({
          organizationId: ctx.organizationId,
          type: "proposal" as const,
          name: name(k + 1),
          number: `${ctx.organizationId.slice(0, 4)}-${String(k + 1).padStart(4, "0")}`,
          content: emptyContent("x"),
          currency: "USD",
          updatedAt: new Date(start + k * 60_000),
        })),
      );
    };

    it("returns 50 documents, then the rest, with hasMore telling whether another page follows", async () => {
      await insertMany(a, 120);
      const first = await listDocuments(db, a);
      expect(first.rows).toHaveLength(50);
      expect(first.hasMore).toBe(true);
      expect(first.rows[0].name).toBe("Doc 120");
      const second = await listDocuments(db, a, {}, { page: 2 });
      expect(second.rows).toHaveLength(50);
      expect(second.hasMore).toBe(true);
      const third = await listDocuments(db, a, {}, { page: 3 });
      expect(third.rows).toHaveLength(20);
      expect(third.hasMore).toBe(false);
      expect(third.rows.at(-1)?.name).toBe("Doc 1");
      const ids = [...first.rows, ...second.rows, ...third.rows].map((row) => row.id);
      expect(new Set(ids).size).toBe(120);
      expect((await listDocuments(db, a, {}, { page: 4 })).rows).toEqual([]);
    });

    it("has no next page when the last page is exactly full", async () => {
      await insertMany(a, 50);
      const result = await listDocuments(db, a);
      expect(result.rows).toHaveLength(50);
      expect(result.hasMore).toBe(false);
    });

    it("keeps the order stable when documents share an update time", async () => {
      const at = new Date("2026-03-01T00:00:00Z");
      await db.insert(documents).values(
        Array.from({ length: 60 }, (_, k) => ({
          organizationId: a.organizationId,
          type: "proposal" as const,
          name: `Same ${k}`,
          number: `S-${k}`,
          content: emptyContent("x"),
          currency: "USD",
          updatedAt: at,
        })),
      );
      const ids = [
        ...(await listDocuments(db, a)).rows,
        ...(await listDocuments(db, a, {}, { page: 2 })).rows,
      ].map((row) => row.id);
      expect(ids).toHaveLength(60);
      expect(new Set(ids).size).toBe(60);
    });

    it("treats an invalid page as the first", async () => {
      await insertMany(a, 3);
      for (const page of [0, -2, 1.5, Number.NaN]) {
        expect((await listDocuments(db, a, {}, { page })).rows).toHaveLength(3);
      }
    });

    it("searches by name or number, ignoring case and treating wildcards literally", async () => {
      const proposal = await createDocument(db, a, { templateId, name: "Spring Campaign" });
      await createDocument(db, a, { type: "invoice", name: "Hosting 100%_done" });
      await createDocument(db, a, { type: "invoice", name: "Other" });
      expect((await listDocuments(db, a, { q: "spring" })).rows.map((d) => d.id)).toEqual([proposal.id]);
      expect((await listDocuments(db, a, { q: "INV-0002" })).rows.map((d) => d.name)).toEqual(["Other"]);
      expect((await listDocuments(db, a, { q: "inv-000" })).rows).toHaveLength(2);
      expect((await listDocuments(db, a, { q: "100%_" })).rows.map((d) => d.name)).toEqual(["Hosting 100%_done"]);
      expect((await listDocuments(db, a, { q: "%" })).rows.map((d) => d.name)).toEqual(["Hosting 100%_done"]);
      expect((await listDocuments(db, a, { q: "nothing like this" })).rows).toEqual([]);
      expect((await listDocuments(db, a, { q: "  " })).rows).toHaveLength(3);
    });

    it("combines search with the status and type filters and with paging", async () => {
      await insertMany(a, 60, (k) => `Report ${k}`);
      const invoice = await createDocument(db, a, { type: "invoice", name: "Report invoice" });
      expect((await listDocuments(db, a, { q: "report", type: "invoice" })).rows.map((d) => d.id)).toEqual([invoice.id]);
      expect((await listDocuments(db, a, { q: "report", status: "sent" })).rows).toEqual([]);
      const first = await listDocuments(db, a, { q: "report" });
      expect(first.rows).toHaveLength(50);
      expect(first.hasMore).toBe(true);
      expect((await listDocuments(db, a, { q: "report" }, { page: 2 })).rows).toHaveLength(11);
    });

    it("keeps search results inside the organization", async () => {
      await createDocument(db, a, { templateId, name: "Shared Name" });
      const foreign = await createDocument(db, b, { name: "Shared Name" });
      const found = await listDocuments(db, b, { q: "shared" });
      expect(found.rows.map((d) => d.id)).toEqual([foreign.id]);
      expect((await listDocuments(db, a, { q: "shared" })).rows.map((d) => d.id)).not.toContain(foreign.id);
      // A number that exists in both organizations only matches within the caller's own.
      expect((await listDocuments(db, b, { q: "P-0001" })).rows.map((d) => d.id)).toEqual([foreign.id]);
    });
  });

  it("does not show a contact from another organization as the client", async () => {
    const foreign = await createContact(db, b, { name: "Mallory", email: "mallory@evil.com" });
    const { id } = await createDocument(db, a, { templateId });
    await db.update(documents).set({ contactId: foreign.id }).where(eq(documents.id, id));
    expect((await listDocuments(db, a)).rows.map((d) => d.contactName)).toEqual([null]);
  });

  it("hides one organization's documents from another", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(getDocument(db, b, id)).rejects.toThrow(new NotFoundError("Document not found."));
    await expect(save(b, id, { name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(deleteDocument(db, b, id)).rejects.toThrow(NotFoundError);
    expect((await listDocuments(db, b)).rows).toEqual([]);
    expect((await getDocument(db, a, id)).name).toBe("Website proposal");
  });
});
