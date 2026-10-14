import type { JSONContent } from "@tiptap/core";
import type { Db } from "@/db/types";
import type { DocumentType } from "@/lib/documents";
import { countQuoteBlocks, extractFields, extractVariables } from "@/lib/editor/content";
import type { Quote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";
import type { OrgContext } from "@/server/tenancy";
import { type DocumentDetail, documentVariableValues } from "./documents";

export type ReadinessInput = {
  type: DocumentType;
  content: JSONContent;
  quote: Quote | null;
  recipients: { role: string | null; kind: "signer" | "cc" }[];
  variableValues: Record<string, string>;
};

/** Everything that blocks sending, as messages for the member. An empty list means ready. */
export function checkSendReadiness(input: ReadinessInput): string[] {
  const problems: string[] = [];
  const signerRoles = new Set(input.recipients.filter((r) => r.kind === "signer").map((r) => r.role));

  if (input.recipients.length === 0) problems.push("Add at least one recipient.");
  else if (input.type !== "invoice" && signerRoles.size === 0) problems.push("Add at least one signer.");

  for (const role of new Set(extractFields(input.content).map((field) => field.role))) {
    if (!signerRoles.has(role)) problems.push(`Fields for the ${role} role have no signer. Add a signer with that role.`);
  }

  for (const name of extractVariables(input.content)) {
    if (!input.variableValues[name]) problems.push(`The variable [${name}] has no value.`);
  }

  const quoteBlocks = countQuoteBlocks(input.content);
  if (quoteBlocks > 0 && !input.quote) problems.push("The content has a pricing table block but the document has no pricing table.");
  if (input.quote && quoteBlocks === 0) problems.push("Insert the pricing table block where the pricing table should appear.");

  if (input.quote) {
    try {
      const totals = computeQuote(input.quote);
      for (const section of input.quote.sections) {
        if (section.kind === "multichoice" && section.items.length > 0 && !section.items.some((item) => item.selected)) {
          problems.push(`Choose an option in the section "${section.title || "Untitled"}".`);
        }
      }
      if (input.type === "invoice" && totals.total === 0) problems.push("An invoice needs a total above zero.");
    } catch (error) {
      if (!(error instanceof QuoteError)) throw error;
      problems.push(error.message);
    }
  } else if (input.type === "invoice") {
    problems.push("An invoice needs a pricing table with a total above zero.");
  }
  return problems;
}

export async function documentReadiness(db: Db, ctx: OrgContext, document: DocumentDetail): Promise<string[]> {
  return checkSendReadiness({
    type: document.type,
    content: document.content,
    quote: document.quote,
    recipients: document.recipients,
    variableValues: await documentVariableValues(db, ctx, document),
  });
}
