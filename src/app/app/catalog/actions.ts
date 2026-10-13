"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createProduct, deleteProduct, updateProduct } from "@/server/catalog/products";
import { type ActionState, actionError } from "../action-state";

function productInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    description: String(formData.get("description") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    price: String(formData.get("price") ?? ""),
    billingType: String(formData.get("billingType") ?? "one_time"),
  };
}

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  const input = productInput(formData);
  try {
    await createProduct(db, ctx, input);
    revalidatePath("/app/catalog");
    return { ok: true, message: "Product added." };
  } catch (error) {
    return actionError("catalog", error, input);
  }
}

export async function updateProductAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  const input = productInput(formData);
  try {
    await updateProduct(db, ctx, id, input);
    revalidatePath("/app/catalog");
    return { ok: true, message: "Product saved." };
  } catch (error) {
    return actionError("catalog", error, input);
  }
}

export async function deleteProductAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteProduct(db, ctx, id);
  revalidatePath("/app/catalog");
  redirect("/app/catalog");
}
