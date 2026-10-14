import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { contacts } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Contact = typeof contacts.$inferSelect;

const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max, `${label} must be at most ${max} characters.`).nullable().default(null),
  );

const ContactInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  company: optionalText("Company", 200),
  phone: optionalText("Phone", 50),
  address: optionalText("Address", 500),
});

/** Escapes LIKE wildcards so user search text matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function scoped(ctx: OrgContext, id: string) {
  return and(eq(contacts.id, id), eq(contacts.organizationId, ctx.organizationId));
}

export async function listContacts(db: Db, ctx: OrgContext, options: { search?: string } = {}): Promise<Contact[]> {
  const search = options.search?.trim();
  const inOrg = eq(contacts.organizationId, ctx.organizationId);
  const pattern = `%${escapeLike(search ?? "")}%`;
  const where = search
    ? and(inOrg, or(ilike(contacts.name, pattern), ilike(contacts.email, pattern), ilike(contacts.company, pattern)))
    : inOrg;
  return db.select().from(contacts).where(where).orderBy(asc(contacts.name)).limit(500);
}

export async function getContact(db: Db, ctx: OrgContext, id: string): Promise<Contact> {
  const [contact] = await db.select().from(contacts).where(scoped(ctx, id)).limit(1);
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}

function duplicateEmail(error: unknown, email: string): never {
  if (isUniqueViolation(error)) throw new ValidationError(`A contact with the email ${email} already exists.`);
  throw error;
}

export async function createContact(db: Db, ctx: OrgContext, input: unknown): Promise<Contact> {
  const data = parseInput(ContactInput, input);
  try {
    const [contact] = await db
      .insert(contacts)
      .values({ ...data, organizationId: ctx.organizationId })
      .returning();
    return contact;
  } catch (error) {
    return duplicateEmail(error, data.email);
  }
}

export async function updateContact(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Contact> {
  const data = parseInput(ContactInput, input);
  let contact: Contact | undefined;
  try {
    [contact] = await db.update(contacts).set(data).where(scoped(ctx, id)).returning();
  } catch (error) {
    duplicateEmail(error, data.email);
  }
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}

export async function deleteContact(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(contacts).where(scoped(ctx, id)).returning({ id: contacts.id });
  if (deleted.length === 0) throw new NotFoundError("Contact not found.");
}
