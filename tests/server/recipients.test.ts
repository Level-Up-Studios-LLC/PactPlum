import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/db/schema";
import type { Db } from "@/db/types";
import { createContact } from "@/server/contacts/contacts";
import { createDocument, getDocument, updateDocument } from "@/server/documents/documents";
import { documentReadiness } from "@/server/documents/readiness";
import { addRecipient, moveRecipient, removeRecipient } from "@/server/documents/recipients";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let b: OrgContext;
let documentId: string;
let jane: string;
let sam: string;
let pat: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, b } = await seedTwoOrganizations(db));
  jane = (await createContact(db, a, { name: "Jane", email: "jane@acme.com" })).id;
  sam = (await createContact(db, a, { name: "Sam", email: "sam@studio.com" })).id;
  pat = (await createContact(db, a, { name: "Pat", email: "pat@acme.com" })).id;
  documentId = (await createDocument(db, a, { type: "contract" })).id;
  await updateDocument(db, a, documentId, { version: 1, roles: ["Client", "Agency"] });
});
afterEach(async () => {
  await close();
});

const summary = async () =>
  (await getDocument(db, a, documentId)).recipients.map((r) => [r.name, r.role, r.kind, r.ordering]);

describe("recipients", () => {
  it("adds signers with a role and copies without one, in order", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await addRecipient(db, a, documentId, { contactId: sam, role: "Agency", kind: "signer" });
    await addRecipient(db, a, documentId, { contactId: pat, kind: "cc", role: "Client" });
    expect(await summary()).toEqual([
      ["Jane", "Client", "signer", 1],
      ["Sam", "Agency", "signer", 2],
      ["Pat", null, "cc", 3],
    ]);
  });

  it.each([
    [{ contactId: "", role: "Client" }, "Choose a contact."],
    [{ role: "Witness" }, "Choose one of this document's roles for the signer."],
    [{ role: "" }, "Choose one of this document's roles for the signer."],
  ])("rejects invalid recipients %#", async (input, message) => {
    await expect(addRecipient(db, a, documentId, { contactId: jane, ...input })).rejects.toThrow(new ValidationError(message));
  });

  it("allows one recipient per role and per email", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    const duplicate = new ValidationError("This document already has a recipient with that role or email address.");
    await expect(addRecipient(db, a, documentId, { contactId: sam, role: "Client" })).rejects.toThrow(duplicate);
    await expect(addRecipient(db, a, documentId, { contactId: jane, role: "Agency" })).rejects.toThrow(duplicate);
  });

  it("reorders and removes recipients", async () => {
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    const second = await addRecipient(db, a, documentId, { contactId: sam, role: "Agency" });
    await moveRecipient(db, a, documentId, second.id, "up");
    expect((await summary()).map(([name, , , order]) => [name, order])).toEqual([
      ["Sam", 1],
      ["Jane", 2],
    ]);
    await moveRecipient(db, a, documentId, second.id, "up");
    await removeRecipient(db, a, documentId, second.id);
    expect((await summary()).map(([name]) => name)).toEqual(["Jane"]);
  });

  it("changes recipients on drafts only", async () => {
    const added = await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await db.update(documents).set({ status: "sent" }).where(eq(documents.id, documentId));
    const draftOnly = new ValidationError("Only draft documents can be edited.");
    await expect(addRecipient(db, a, documentId, { contactId: sam, role: "Agency" })).rejects.toThrow(draftOnly);
    await expect(removeRecipient(db, a, documentId, added.id)).rejects.toThrow(draftOnly);
    await expect(moveRecipient(db, a, documentId, added.id, "down")).rejects.toThrow(draftOnly);
  });

  it("refuses other organizations' documents and contacts", async () => {
    const bobContact = (await createContact(db, b, { name: "Bob", email: "bob@globex.com" })).id;
    await expect(addRecipient(db, b, documentId, { contactId: bobContact, role: "Client" })).rejects.toThrow(
      new NotFoundError("Document not found."),
    );
    await expect(addRecipient(db, a, documentId, { contactId: bobContact, role: "Client" })).rejects.toThrow(
      new NotFoundError("Contact not found."),
    );
    const added = await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    await expect(removeRecipient(db, b, documentId, added.id)).rejects.toThrow(NotFoundError);
    await expect(removeRecipient(db, a, documentId, "missing")).rejects.toThrow(new NotFoundError("Recipient not found."));
  });

  it("reports readiness from the stored document", async () => {
    const document = await getDocument(db, a, documentId);
    expect(await documentReadiness(db, a, document)).toEqual(["Add at least one recipient."]);
    await addRecipient(db, a, documentId, { contactId: jane, role: "Client" });
    expect(await documentReadiness(db, a, await getDocument(db, a, documentId))).toEqual([]);
  });
});
