"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createContact, deleteContact, updateContact } from "@/server/contacts/contacts";
import { type ActionState, actionError } from "../action-state";

function contactInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
  };
}

export async function createContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await createContact(db, ctx, contactInput(formData));
    revalidatePath("/app/contacts");
    return { ok: true, message: "Contact added." };
  } catch (error) {
    return actionError("contacts", error);
  }
}

export async function updateContactAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateContact(db, ctx, id, contactInput(formData));
    revalidatePath("/app/contacts");
    return { ok: true, message: "Contact saved." };
  } catch (error) {
    return actionError("contacts", error);
  }
}

export async function deleteContactAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteContact(db, ctx, id);
  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}
