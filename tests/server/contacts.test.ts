import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from "@/server/contacts/contacts";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, seedTwoOrganizations } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let a: OrgContext;
let aMember: OrgContext;
let b: OrgContext;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ({ a, aMember, b } = await seedTwoOrganizations(db));
});
afterEach(async () => {
  await close();
});

const jane = { name: "Jane Doe", email: " Jane@Acme.com ", company: "Acme", phone: "", address: "" };

describe("contacts", () => {
  it("lets a member create a contact with a normalized email and null blanks", async () => {
    const contact = await createContact(db, aMember, jane);
    expect(contact).toMatchObject({
      organizationId: a.organizationId,
      name: "Jane Doe",
      email: "jane@acme.com",
      company: "Acme",
      phone: null,
      address: null,
    });
  });

  it.each([
    [{ ...jane, name: " " }, "Name is required."],
    [{ ...jane, email: "not-an-email" }, "Enter a valid email address."],
    [{ ...jane, phone: "1".repeat(51) }, "Phone must be at most 50 characters."],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(createContact(db, a, input)).rejects.toThrow(new ValidationError(message));
  });

  it("rejects a duplicate email in the same organization only", async () => {
    await createContact(db, a, jane);
    await expect(createContact(db, a, { ...jane, name: "Other" })).rejects.toThrow(
      new ValidationError("A contact with the email jane@acme.com already exists."),
    );
    await expect(createContact(db, b, jane)).resolves.toMatchObject({ organizationId: b.organizationId });
  });

  it("searches name, email and company case-insensitively and treats % literally", async () => {
    await createContact(db, a, jane);
    await createContact(db, a, { name: "Bob Smith", email: "bob@globex.com", company: "Globex 100%" });
    expect((await listContacts(db, a, { search: "JANE" })).map((c) => c.name)).toEqual(["Jane Doe"]);
    expect((await listContacts(db, a, { search: "globex" })).map((c) => c.name)).toEqual(["Bob Smith"]);
    expect((await listContacts(db, a, { search: "100%" })).map((c) => c.name)).toEqual(["Bob Smith"]);
    expect(await listContacts(db, a, { search: "%" })).toHaveLength(1);
    expect((await listContacts(db, a)).map((c) => c.name)).toEqual(["Bob Smith", "Jane Doe"]);
  });

  it("updates and deletes a contact", async () => {
    const contact = await createContact(db, a, jane);
    const updated = await updateContact(db, a, contact.id, { ...jane, name: "Jane Roe", phone: "+1 555 0100" });
    expect(updated).toMatchObject({ name: "Jane Roe", phone: "+1 555 0100" });
    await deleteContact(db, a, contact.id);
    await expect(getContact(db, a, contact.id)).rejects.toThrow(NotFoundError);
  });

  it("hides one organization's contacts from another", async () => {
    const contact = await createContact(db, a, jane);
    await expect(getContact(db, b, contact.id)).rejects.toThrow(new NotFoundError("Contact not found."));
    await expect(updateContact(db, b, contact.id, { ...jane, name: "Hacked" })).rejects.toThrow(NotFoundError);
    await expect(deleteContact(db, b, contact.id)).rejects.toThrow(NotFoundError);
    expect(await listContacts(db, b)).toEqual([]);
    expect((await getContact(db, a, contact.id)).name).toBe("Jane Doe");
  });
});
