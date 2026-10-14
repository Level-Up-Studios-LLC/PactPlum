import Link from "next/link";
import { db } from "@/db/client";
import { formatMoney } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { BILLING_TYPE_LABELS, listProducts } from "@/server/catalog/products";
import { getOrganizationSettings } from "@/server/org/settings";
import { inputClass, secondaryButtonClass } from "../ui";
import { createProductAction } from "./actions";
import { ProductForm } from "./product-form";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { ctx } = await requireMember();
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ : "";
  const [products, org] = await Promise.all([listProducts(db, ctx, { search: q }), getOrganizationSettings(db, ctx)]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Catalog</h1>
        <form role="search" className="mb-4 flex gap-2">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <input id="product-search" name="q" defaultValue={q} placeholder="Search by title, SKU or description" className={inputClass} />
          <button type="submit" className={secondaryButtonClass}>
            Search
          </button>
        </form>
        {products.length === 0 ? (
          <p className="text-sm text-neutral-600">{q ? "No products match your search." : "No products yet."}</p>
        ) : (
          <ul className="divide-y rounded-md border border-neutral-200 bg-white">
            {products.map((product) => (
              <li key={product.id} className="flex justify-between gap-4 px-4 py-2 text-sm">
                <Link href={`/app/catalog/${product.id}`} className="font-medium text-[#6b2d5c] hover:underline">
                  {product.title}
                  {product.sku && <span className="ml-2 text-neutral-500">{product.sku}</span>}
                </Link>
                <span className="text-neutral-600">
                  {formatMoney(product.unitPrice, product.currency)} · {BILLING_TYPE_LABELS[product.billingType]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add a product</h2>
        <ProductForm
          action={createProductAction}
          currencies={Intl.supportedValuesOf("currency")}
          defaultCurrency={org.defaultCurrency}
          submitLabel="Add product"
        />
      </section>
    </div>
  );
}
