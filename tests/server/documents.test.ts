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
import { NotFoundError, ValidationError } from "@/server/errors";
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

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, aMember, b } = await seedTwoOrganizations(db));
  const template = await createTemplate(db, a, { name: "Website proposal" });
  await updateTemplate(db, a, template.id, {
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
    const updated = await updateDocument(db, a, id, { quote: pricedQuote(3, "EUR"), total: 1, currency: "JPY" });
    expect(updated).toMatchObject({ total: 300000, currency: "EUR" });
    const cleared = await updateDocument(db, a, id, { quote: null });
    expect(cleared).toMatchObject({ total: 0, currency: "EUR", quote: null });
  });

  it("stores trimmed custom variables and combines them with automatic values", async () => {
    const { id } = await createDocument(db, aMember, { templateId, contactId });
    const updated = await updateDocument(db, a, id, { variables: { "Deal.Value": " Gold ", "Deal.Empty": " " } });
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
    await expect(updateDocument(db, a, id, input)).rejects.toThrow(new ValidationError(message));
  });

  it("refuses to remove a role that a recipient holds", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(updateDocument(db, a, id, { roles: ["Agency"] })).rejects.toThrow(
      new ValidationError('Remove the recipient Jane Doe or give them another role before removing the role "Client".'),
    );
  });

  it("changes the client contact only to one in the same organization", async () => {
    const { id } = await createDocument(db, a, { templateId });
    expect((await updateDocument(db, a, id, { contactId })).contactId).toBe(contactId);
    const other = await createContact(db, b, { name: "Bob", email: "bob@globex.com" });
    await expect(updateDocument(db, a, id, { contactId: other.id })).rejects.toThrow(NotFoundError);
    expect((await updateDocument(db, a, id, { contactId: null })).contactId).toBeNull();
  });

  it("edits and deletes drafts only", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, id));
    await expect(updateDocument(db, a, id, { name: "Changed" })).rejects.toThrow(
      new ValidationError("Only draft documents can be edited."),
    );
    await expect(deleteDocument(db, a, id)).rejects.toThrow(new ValidationError("Only draft documents can be edited."));
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
    expect((await listDocuments(db, a)).map((d) => [d.number, d.contactName])).toEqual(
      expect.arrayContaining([
        ["P-0001", "Jane Doe"],
        ["INV-0001", null],
      ]),
    );
    expect((await listDocuments(db, a, { status: "sent" })).map((d) => d.number)).toEqual(["INV-0001"]);
    expect((await listDocuments(db, a, { type: "proposal" })).map((d) => d.number)).toEqual(["P-0001"]);
  });

  it("hides one organization's documents from another", async () => {
    const { id } = await createDocument(db, a, { templateId, contactId });
    await expect(getDocument(db, b, id)).rejects.toThrow(new NotFoundError("Document not found."));
    await expect(updateDocument(db, b, id, { name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(deleteDocument(db, b, id)).rejects.toThrow(NotFoundError);
    expect(await listDocuments(db, b)).toEqual([]);
    expect((await getDocument(db, a, id)).name).toBe("Website proposal");
  });
});
