import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { recipients } from "@/db/schema";
import type { Db } from "@/db/types";
import { getContact } from "@/server/contacts/contacts";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";
import { getDraftDocument, type Recipient } from "./documents";

const AddInput = z.object({
  contactId: z.string().trim().min(1, "Choose a contact."),
  kind: z.enum(["signer", "cc"]).default("signer"),
  role: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(40).nullable().default(null),
  ),
});

export async function addRecipient(db: Db, ctx: OrgContext, documentId: string, input: unknown): Promise<Recipient> {
  const data = parseInput(AddInput, input);
  const document = await getDraftDocument(db, ctx, documentId);
  const contact = await getContact(db, ctx, data.contactId);
  const role = data.kind === "signer" ? data.role : null;
  if (data.kind === "signer" && (!role || !document.roles.includes(role))) {
    throw new ValidationError("Choose one of this document's roles for the signer.");
  }
  const ordering = Math.max(0, ...document.recipients.map((recipient) => recipient.ordering)) + 1;
  try {
    const [recipient] = await db
      .insert(recipients)
      .values({
        organizationId: ctx.organizationId,
        documentId,
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        role,
        kind: data.kind,
        ordering,
      })
      .returning();
    return recipient;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError("This document already has a recipient with that role or email address.");
    }
    throw error;
  }
}

export async function removeRecipient(db: Db, ctx: OrgContext, documentId: string, recipientId: string): Promise<void> {
  await getDraftDocument(db, ctx, documentId);
  const deleted = await db
    .delete(recipients)
    .where(
      and(
        eq(recipients.id, recipientId),
        eq(recipients.documentId, documentId),
        eq(recipients.organizationId, ctx.organizationId),
      ),
    )
    .returning({ id: recipients.id });
  if (deleted.length === 0) throw new NotFoundError("Recipient not found.");
}

export async function moveRecipient(
  db: Db,
  ctx: OrgContext,
  documentId: string,
  recipientId: string,
  direction: "up" | "down",
): Promise<void> {
  const document = await getDraftDocument(db, ctx, documentId);
  const list = document.recipients;
  const index = list.findIndex((recipient) => recipient.id === recipientId);
  if (index === -1) throw new NotFoundError("Recipient not found.");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await db.transaction(async (tx) => {
    for (const [position, recipient] of reordered.entries()) {
      await tx
        .update(recipients)
        .set({ ordering: position + 1 })
        .where(and(eq(recipients.id, recipient.id), eq(recipients.organizationId, ctx.organizationId)));
    }
  });
}
