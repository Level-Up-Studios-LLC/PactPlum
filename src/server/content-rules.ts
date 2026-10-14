import { z } from "zod";
import type { PaymentMode } from "@/lib/documents";
import { type DocContent, validateContent } from "@/lib/editor/content";
import { type Quote, safeParseQuote } from "@/lib/quote/schema";
import { computeQuote, QuoteError } from "@/lib/quote/totals";
import { ValidationError } from "./errors";

export const RolesSchema = z
  .array(z.string().trim().min(1, "Role names cannot be empty.").max(40, "Role names must be at most 40 characters."))
  .min(1, "Add at least one role.")
  .max(10, "A document can have at most 10 roles.")
  .refine((roles) => new Set(roles.map((role) => role.toLowerCase())).size === roles.length, "Role names must be unique.");

const VERSION_MESSAGE = "Reload the page and try again.";
/** The saved version the caller loaded; every update must send it. */
export const VersionSchema = z.number(VERSION_MESSAGE).int(VERSION_MESSAGE).positive(VERSION_MESSAGE);

export function checkContent(input: unknown, roles: string[]): DocContent {
  const result = validateContent(input, roles);
  if (!result.ok) throw new ValidationError(result.error);
  return result.content;
}

/** Validates a pricing table and proves its totals compute. null means the document has none. */
export function checkQuote(input: unknown): Quote | null {
  if (input === null) return null;
  const result = safeParseQuote(input);
  if (!result.ok) throw new ValidationError(result.error);
  try {
    computeQuote(result.quote);
  } catch (error) {
    if (error instanceof QuoteError) throw new ValidationError(error.message);
    throw error;
  }
  return result.quote;
}

export function checkPayment(
  mode: PaymentMode,
  percent: number | null,
): { paymentMode: PaymentMode; paymentPercent: number | null } {
  if (mode !== "deposit_percent") return { paymentMode: mode, paymentPercent: null };
  if (percent === null || !Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ValidationError("Enter a deposit percent between 1 and 100.");
  }
  return { paymentMode: mode, paymentPercent: percent };
}
