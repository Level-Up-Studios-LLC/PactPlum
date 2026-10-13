import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { contacts, documents, recipients, user } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
  PAYMENT_MODES,
} from "@/lib/documents";
import { emptyContent, VARIABLE_NAME_PATTERN } from "@/lib/editor/content";
import { variableValues } from "@/lib/editor/variables";
import { emptyQuote, type Quote } from "@/lib/quote/schema";
import { computeQuote } from "@/lib/quote/totals";
import { getContact } from "@/server/contacts/contacts";
import { checkContent, checkPayment, checkQuote, RolesSchema } from "@/server/content-rules";
import { NotFoundError, ValidationError } from "@/server/errors";
import { getOrganizationSettings } from "@/server/org/settings";
import { getTemplate } from "@/server/templates/templates";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";
import { allocateDocumentNumber } from "./numbering";

export type DocumentRow = typeof documents.$inferSelect;
export type Recipient = typeof recipients.$inferSelect;
export type DocumentDetail = DocumentRow & { recipients: Recipient[] };
export type DocumentSummary = Pick<
  DocumentRow,
  "id" | "name" | "number" | "type" | "status" | "total" | "currency" | "updatedAt"
> & { contactName: string | null };

// Types that always carry a pricing table.
const PRICED_TYPES: readonly DocumentType[] = ["quote", "invoice"];

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const optionalId = z.preprocess(blankToNull, z.string().min(1).nullable().default(null));

const CreateInput = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  name: z.string().trim().max(200, "Name must be at most 200 characters.").optional(),
  templateId: optionalId,
  contactId: optionalId,
});

// Keys are checked in superRefine because record-key failures do not carry custom messages.
const Variables = z
  .record(z.string(), z.string().max(1000, "Variable values must be at most 1000 characters."))
  .superRefine((values, ctx) => {
    const names = Object.keys(values);
    if (names.some((name) => !VARIABLE_NAME_PATTERN.test(name))) {
      ctx.addIssue({ code: "custom", message: "Variable names look like Group.Name." });
    } else if (names.length > 100) {
      ctx.addIssue({ code: "custom", message: "A document can have at most 100 custom variables." });
    }
  });

const UpdateInput = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters."),
    contactId: z.preprocess(blankToNull, z.string().min(1).nullable()),
    roles: RolesSchema,
    content: z.unknown(),
    quote: z.unknown(),
    variables: Variables,
    paymentMode: z.enum(PAYMENT_MODES),
    paymentPercent: z.number().nullable(),
  })
  .partial();

function scoped(ctx: OrgContext, id: string) {
  return and(eq(documents.id, id), eq(documents.organizationId, ctx.organizationId));
}

export async function createDocument(db: Db, ctx: OrgContext, input: unknown): Promise<DocumentRow> {
  const data = parseInput(CreateInput, input);
  // Tenant-scoped lookups first, so a refused request does not take a number.
  const template = data.templateId ? await getTemplate(db, ctx, data.templateId) : null;
  const contact = data.contactId ? await getContact(db, ctx, data.contactId) : null;
  const org = await getOrganizationSettings(db, ctx);

  const type = data.type ?? template?.documentType ?? "proposal";
  const name = data.name || template?.name || `New ${DOCUMENT_TYPE_LABELS[type].toLowerCase()}`;
  const roles = template?.roles ?? ["Client"];
  const quote: Quote | null = template?.quote ?? (PRICED_TYPES.includes(type) ? emptyQuote(org.defaultCurrency) : null);

  return db.transaction(async (tx) => {
    const number = await allocateDocumentNumber(tx, ctx, type);
    const [document] = await tx
      .insert(documents)
      .values({
        organizationId: ctx.organizationId,
        type,
        name,
        number,
        templateId: template?.id ?? null,
        contactId: contact?.id ?? null,
        createdByUserId: ctx.userId,
        content: template?.content ?? emptyContent(name),
        quote,
        roles,
        currency: quote?.currency ?? org.defaultCurrency,
        total: quote ? computeQuote(quote).total : 0,
        paymentMode: template?.paymentMode ?? "off",
        paymentPercent: template?.paymentPercent ?? null,
      })
      .returning();
    if (contact) {
      await tx.insert(recipients).values({
        organizationId: ctx.organizationId,
        documentId: document.id,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        role: roles[0],
        kind: "signer",
        ordering: 1,
      });
    }
    return document;
  });
}

export async function listDocuments(
  db: Db,
  ctx: OrgContext,
  filters: { status?: DocumentStatus; type?: DocumentType } = {},
): Promise<DocumentSummary[]> {
  const conditions = [eq(documents.organizationId, ctx.organizationId)];
  if (filters.status) conditions.push(eq(documents.status, filters.status));
  if (filters.type) conditions.push(eq(documents.type, filters.type));
  return db
    .select({
      id: documents.id,
      name: documents.name,
      number: documents.number,
      type: documents.type,
      status: documents.status,
      total: documents.total,
      currency: documents.currency,
      updatedAt: documents.updatedAt,
      contactName: contacts.name,
    })
    .from(documents)
    .leftJoin(contacts, and(eq(contacts.id, documents.contactId), eq(contacts.organizationId, ctx.organizationId)))
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(200);
}

export async function getDocument(db: Db, ctx: OrgContext, id: string): Promise<DocumentDetail> {
  const [document] = await db.select().from(documents).where(scoped(ctx, id)).limit(1);
  if (!document) throw new NotFoundError("Document not found.");
  const rows = await db
    .select()
    .from(recipients)
    .where(and(eq(recipients.documentId, id), eq(recipients.organizationId, ctx.organizationId)))
    .orderBy(asc(recipients.ordering), asc(recipients.createdAt));
  return { ...document, recipients: rows };
}

export async function getDraftDocument(db: Db, ctx: OrgContext, id: string): Promise<DocumentDetail> {
  const document = await getDocument(db, ctx, id);
  if (document.status !== "draft") throw new ValidationError("Only draft documents can be edited.");
  return document;
}

export async function updateDocument(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<DocumentRow> {
  const data = parseInput(UpdateInput, input);
  const existing = await getDraftDocument(db, ctx, id);

  const roles = data.roles ?? existing.roles;
  const orphan = existing.recipients.find((recipient) => recipient.role !== null && !roles.includes(recipient.role));
  if (orphan) {
    throw new ValidationError(
      `Remove the recipient ${orphan.name} or give them another role before removing the role "${orphan.role}".`,
    );
  }
  const content = checkContent(data.content !== undefined ? data.content : existing.content, roles);
  const quote = data.quote !== undefined ? checkQuote(data.quote) : existing.quote;
  const payment = checkPayment(
    data.paymentMode ?? existing.paymentMode,
    data.paymentPercent !== undefined ? data.paymentPercent : existing.paymentPercent,
  );
  let contactId = existing.contactId;
  if (data.contactId !== undefined) {
    contactId = data.contactId === null ? null : (await getContact(db, ctx, data.contactId)).id;
  }
  const variables = data.variables
    ? Object.fromEntries(
        Object.entries(data.variables)
          .map(([name, value]) => [name, value.trim()] as const)
          .filter(([, value]) => value !== ""),
      )
    : existing.variables;

  const [document] = await db
    .update(documents)
    .set({
      name: data.name ?? existing.name,
      contactId,
      roles,
      content,
      quote,
      variables,
      ...payment,
      // Always derived from the stored pricing table, never from input.
      currency: quote?.currency ?? existing.currency,
      total: quote ? computeQuote(quote).total : 0,
    })
    .where(and(scoped(ctx, id), eq(documents.status, "draft")))
    .returning();
  if (!document) throw new ValidationError("Only draft documents can be edited.");
  return document;
}

export async function deleteDocument(db: Db, ctx: OrgContext, id: string): Promise<void> {
  await getDraftDocument(db, ctx, id);
  const deleted = await db
    .delete(documents)
    .where(and(scoped(ctx, id), eq(documents.status, "draft")))
    .returning({ id: documents.id });
  if (deleted.length === 0) throw new ValidationError("Only draft documents can be edited.");
}

export async function documentVariableValues(db: Db, ctx: OrgContext, document: DocumentRow): Promise<Record<string, string>> {
  const [contact] = document.contactId
    ? await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, document.contactId), eq(contacts.organizationId, ctx.organizationId)))
        .limit(1)
    : [];
  const [sender] = document.createdByUserId
    ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, document.createdByUserId)).limit(1)
    : [];
  const org = await getOrganizationSettings(db, ctx);
  return variableValues(
    {
      contact: contact ?? null,
      sender: sender ?? null,
      organizationName: org.name,
      document: { name: document.name, number: document.number, total: document.total, currency: document.currency },
    },
    document.variables,
  );
}
