import { sql } from "drizzle-orm";
import { numberingSequences } from "@/db/schema";
import type { Db } from "@/db/types";
import { DEFAULT_NUMBER_PREFIXES, type DocumentType, formatDocumentNumber } from "@/lib/documents";
import type { OrgContext } from "@/server/tenancy";

/**
 * Takes the next number for a document type in one atomic statement: the first
 * call creates the sequence at 2 and returns 1; later calls increment it.
 */
export async function allocateDocumentNumber(db: Db, ctx: OrgContext, type: DocumentType): Promise<string> {
  const [row] = await db
    .insert(numberingSequences)
    .values({
      organizationId: ctx.organizationId,
      documentType: type,
      prefix: DEFAULT_NUMBER_PREFIXES[type],
      nextValue: 2,
    })
    .onConflictDoUpdate({
      target: [numberingSequences.organizationId, numberingSequences.documentType],
      set: { nextValue: sql`${numberingSequences.nextValue} + 1` },
    })
    .returning({ prefix: numberingSequences.prefix, nextValue: numberingSequences.nextValue });
  return formatDocumentNumber(row.prefix, row.nextValue - 1);
}
