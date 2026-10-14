import Link from "next/link";
import { db } from "@/db/client";
import { minorToDecimalString } from "@/lib/money";
import { requireMember } from "@/server/auth/session";
import { getProduct } from "@/server/catalog/products";
import { ConfirmButton } from "../../confirm-button";
import { loadOrNotFound } from "../../load";
import { dangerButtonClass } from "../../ui";
import { deleteProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireMember();
  const { id } = await params;
  const product = await loadOrNotFound(getProduct(db, ctx, id));

  return (
    <div className="space-y-8">
      <Link href="/app/catalog" className="text-sm text-neutral-600 hover:underline">
        ← Catalog
      </Link>
      <section>
        <h1 className="mb-4 text-2xl font-semibold">{product.title}</h1>
        <ProductForm
          action={updateProductAction.bind(null, product.id)}
          product={{ ...product, price: minorToDecimalString(product.unitPrice, product.currency) }}
          currencies={Intl.supportedValuesOf("currency")}
          defaultCurrency={product.currency}
          submitLabel="Save product"
        />
      </section>
      <form action={deleteProductAction.bind(null, product.id)}>
        <ConfirmButton
          message="Delete this product? Existing quotes keep their copied line items."
          label="Delete product"
          className={dangerButtonClass}
        />
      </form>
    </div>
  );
}
