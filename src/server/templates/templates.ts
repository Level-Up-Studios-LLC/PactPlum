import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { templates } from "@/db/schema";
import type { Db } from "@/db/types";
import { DOCUMENT_TYPES, PAYMENT_MODES } from "@/lib/documents";
import { emptyContent } from "@/lib/editor/content";
import { checkContent, checkPayment, checkQuote, RolesSchema, VersionSchema } from "@/server/content-rules";
import { ConflictError, NotFoundError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Template = typeof templates.$inferSelect;
export type TemplateSummary = Pick<Template, "id" | "name" | "documentType" | "updatedAt">;

const Name = z.string().trim().min(1, "Name is required.").max(200, "Name must be at most 200 characters.");

const CreateInput = z.object({
  name: Name,
  documentType: z.enum(DOCUMENT_TYPES).default("proposal"),
});

const UpdateInput = z
  .object({
    name: Name,
    documentType: z.enum(DOCUMENT_TYPES),
    roles: RolesSchema,
    content: z.unknown(),
    quote: z.unknown(),
    paymentMode: z.enum(PAYMENT_MODES),
    paymentPercent: z.number().nullable(),
  })
  .partial()
  // The version of the template the caller loaded; required, so a save never overwrites a newer one blindly.
  .extend({ version: VersionSchema });

function scoped(ctx: OrgContext, id: string) {
  return and(eq(templates.id, id), eq(templates.organizationId, ctx.organizationId));
}

export async function listTemplates(db: Db, ctx: OrgContext): Promise<TemplateSummary[]> {
  return db
    .select({ id: templates.id, name: templates.name, documentType: templates.documentType, updatedAt: templates.updatedAt })
    .from(templates)
    .where(eq(templates.organizationId, ctx.organizationId))
    .orderBy(asc(templates.name));
}

export async function getTemplate(db: Db, ctx: OrgContext, id: string): Promise<Template> {
  const [template] = await db.select().from(templates).where(scoped(ctx, id)).limit(1);
  if (!template) throw new NotFoundError("Template not found.");
  return template;
}

export async function createTemplate(db: Db, ctx: OrgContext, input: unknown): Promise<Template> {
  const data = parseInput(CreateInput, input);
  const [template] = await db
    .insert(templates)
    .values({
      organizationId: ctx.organizationId,
      name: data.name,
      documentType: data.documentType,
      content: emptyContent(data.name),
      createdByUserId: ctx.userId,
    })
    .returning();
  return template;
}

const TEMPLATE_CONFLICT_MESSAGE =
  "Someone else saved this template since you opened it. Reload the page to see their changes, then make your edits again.";

export async function updateTemplate(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Template> {
  const data = parseInput(UpdateInput, input);
  const existing = await getTemplate(db, ctx, id);
  // Checked before anything else, so a stale save gets the conflict and not an error about changes it never saw.
  if (existing.version !== data.version) throw new ConflictError(TEMPLATE_CONFLICT_MESSAGE);
  const roles = data.roles ?? existing.roles;
  // Content is re-checked against the roles even when only the roles change.
  const content = checkContent(data.content !== undefined ? data.content : existing.content, roles);
  const quote = data.quote !== undefined ? checkQuote(data.quote) : existing.quote;
  const payment = checkPayment(
    data.paymentMode ?? existing.paymentMode,
    data.paymentPercent !== undefined ? data.paymentPercent : existing.paymentPercent,
  );
  const [template] = await db
    .update(templates)
    .set({
      name: data.name ?? existing.name,
      documentType: data.documentType ?? existing.documentType,
      roles,
      content,
      quote,
      ...payment,
      version: sql`${templates.version} + 1`,
    })
    .where(and(scoped(ctx, id), eq(templates.version, data.version)))
    .returning();
  if (template) return template;
  // Nothing matched: the template was deleted, or saved by someone else after the read above.
  await getTemplate(db, ctx, id);
  throw new ConflictError(TEMPLATE_CONFLICT_MESSAGE);
}

export async function duplicateTemplate(db: Db, ctx: OrgContext, id: string): Promise<Template> {
  const source = await getTemplate(db, ctx, id);
  const [copy] = await db
    .insert(templates)
    .values({
      organizationId: ctx.organizationId,
      name: `${source.name} (copy)`.slice(0, 200),
      documentType: source.documentType,
      content: source.content,
      roles: source.roles,
      quote: source.quote,
      paymentMode: source.paymentMode,
      paymentPercent: source.paymentPercent,
      createdByUserId: ctx.userId,
    })
    .returning();
  return copy;
}

export async function deleteTemplate(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(templates).where(scoped(ctx, id)).returning({ id: templates.id });
  if (deleted.length === 0) throw new NotFoundError("Template not found.");
}
