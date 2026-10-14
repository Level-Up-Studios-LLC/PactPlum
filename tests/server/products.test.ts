import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "@/server/catalog/products";
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

const design = { title: "Website design", sku: "WEB-1", description: "Up to 5 pages", currency: "usd", price: "1,250.50" };

describe("products", () => {
  it("lets a member create a product priced in minor units", async () => {
    const product = await createProduct(db, aMember, design);
    expect(product).toMatchObject({ title: "Website design", sku: "WEB-1", currency: "USD", unitPrice: 125050, billingType: "one_time" });
  });

  it("prices zero-decimal currencies in whole units", async () => {
    const product = await createProduct(db, a, { ...design, sku: "", currency: "JPY", price: "1250" });
    expect(product).toMatchObject({ unitPrice: 1250, currency: "JPY", sku: null });
  });

  it.each([
    [{ ...design, title: "" }, "Title is required."],
    [{ ...design, currency: "ABC" }, "Unknown currency code."],
    [{ ...design, price: "12.345" }, "Enter a valid price in USD, for example 1250.00."],
    [{ ...design, price: "-5" }, "Enter a valid price in USD, for example 1250.00."],
    [{ ...design, billingType: "weekly" }, "Choose a billing type."],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(createProduct(db, a, input)).rejects.toThrow(new ValidationError(message));
  });

  it("keeps SKUs unique within an organization only", async () => {
    await createProduct(db, a, design);
    await expect(createProduct(db, a, design)).rejects.toThrow(
      new ValidationError("A product with the SKU WEB-1 already exists."),
    );
    await expect(createProduct(db, b, design)).resolves.toMatchObject({ organizationId: b.organizationId });
  });

  it("filters by currency and searches title, SKU and description", async () => {
    await createProduct(db, a, design);
    await createProduct(db, a, { title: "Hosting", sku: "HOST", description: "Monthly", currency: "EUR", price: "20", billingType: "monthly" });
    expect((await listProducts(db, a, { currency: "EUR" })).map((p) => p.title)).toEqual(["Hosting"]);
    expect((await listProducts(db, a, { search: "web-" })).map((p) => p.title)).toEqual(["Website design"]);
    expect((await listProducts(db, a, { search: "monthly" })).map((p) => p.title)).toEqual(["Hosting"]);
  });

  it("updates and deletes a product", async () => {
    const product = await createProduct(db, a, design);
    expect(await updateProduct(db, a, product.id, { ...design, price: "99" })).toMatchObject({ unitPrice: 9900 });
    await deleteProduct(db, a, product.id);
    await expect(getProduct(db, a, product.id)).rejects.toThrow(NotFoundError);
  });

  it("hides one organization's products from another", async () => {
    const product = await createProduct(db, a, design);
    await expect(getProduct(db, b, product.id)).rejects.toThrow(new NotFoundError("Product not found."));
    await expect(updateProduct(db, b, product.id, { ...design, price: "1" })).rejects.toThrow(NotFoundError);
    await expect(deleteProduct(db, b, product.id)).rejects.toThrow(NotFoundError);
    expect(await listProducts(db, b)).toEqual([]);
    expect((await getProduct(db, a, product.id)).unitPrice).toBe(125050);
  });
});
