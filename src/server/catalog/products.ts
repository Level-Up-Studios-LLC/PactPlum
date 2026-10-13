import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { products } from "@/db/schema";
import type { Db } from "@/db/types";
import { isCurrencyCode, minorToDecimalString, parseMoney } from "@/lib/money";
import { escapeLike } from "@/server/contacts/contacts";
import { isUniqueViolation } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { OrgContext } from "@/server/tenancy";
import { parseInput } from "@/server/validation";

export type Product = typeof products.$inferSelect;

export const PRODUCT_BILLING_TYPES = ["one_time", "monthly", "yearly"] as const;
export const BILLING_TYPE_LABELS: Record<(typeof PRODUCT_BILLING_TYPES)[number], string> = {
  one_time: "One-time",
  monthly: "Monthly",
  yearly: "Yearly",
};

const ProductInput = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200, "Title must be at most 200 characters."),
    sku: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().max(64, "SKU must be at most 64 characters.").nullable().default(null),
    ),
    description: z.string().trim().max(2000, "Description must be at most 2000 characters.").default(""),
    currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Unknown currency code."),
    price: z.string(),
    billingType: z.enum(PRODUCT_BILLING_TYPES, "Choose a billing type.").default("one_time"),
  })
  .transform((input, ctx) => {
    // The currency refinement has already reported an unknown code.
    if (!isCurrencyCode(input.currency)) return z.NEVER;
    const unitPrice = parseMoney(input.price, input.currency);
    if (unitPrice === null) {
      // 125000 minor units reads "1250.00" for USD and "125000" for JPY.
      const example = minorToDecimalString(125000, input.currency);
      ctx.addIssue({ code: "custom", message: `Enter a valid price in ${input.currency}, for example ${example}.` });
      return z.NEVER;
    }
    return {
      title: input.title,
      sku: input.sku,
      description: input.description,
      currency: input.currency,
      billingType: input.billingType,
      unitPrice,
    };
  });

function scoped(ctx: OrgContext, id: string) {
  return and(eq(products.id, id), eq(products.organizationId, ctx.organizationId));
}

function duplicateSku(error: unknown, sku: string | null): never {
  if (isUniqueViolation(error)) throw new ValidationError(`A product with the SKU ${sku} already exists.`);
  throw error;
}

export async function listProducts(
  db: Db,
  ctx: OrgContext,
  options: { search?: string; currency?: string } = {},
): Promise<Product[]> {
  const conditions = [eq(products.organizationId, ctx.organizationId)];
  if (options.currency) conditions.push(eq(products.currency, options.currency));
  const search = options.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(or(ilike(products.title, pattern), ilike(products.sku, pattern), ilike(products.description, pattern))!);
  }
  return db.select().from(products).where(and(...conditions)).orderBy(asc(products.title)).limit(500);
}

export async function getProduct(db: Db, ctx: OrgContext, id: string): Promise<Product> {
  const [product] = await db.select().from(products).where(scoped(ctx, id)).limit(1);
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

export async function createProduct(db: Db, ctx: OrgContext, input: unknown): Promise<Product> {
  const data = parseInput(ProductInput, input);
  try {
    const [product] = await db.insert(products).values({ ...data, organizationId: ctx.organizationId }).returning();
    return product;
  } catch (error) {
    return duplicateSku(error, data.sku);
  }
}

export async function updateProduct(db: Db, ctx: OrgContext, id: string, input: unknown): Promise<Product> {
  const data = parseInput(ProductInput, input);
  let product: Product | undefined;
  try {
    [product] = await db.update(products).set(data).where(scoped(ctx, id)).returning();
  } catch (error) {
    duplicateSku(error, data.sku);
  }
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

export async function deleteProduct(db: Db, ctx: OrgContext, id: string): Promise<void> {
  const deleted = await db.delete(products).where(scoped(ctx, id)).returning({ id: products.id });
  if (deleted.length === 0) throw new NotFoundError("Product not found.");
}
