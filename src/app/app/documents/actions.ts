"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { createDocument, deleteDocument, updateDocument } from "@/server/documents/documents";
import { addRecipient, moveRecipient, removeRecipient } from "@/server/documents/recipients";
import { type ActionState, actionError } from "../action-state";

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  let id: string;
  try {
    const type = String(formData.get("type") ?? "");
    const document = await createDocument(db, ctx, {
      type: type === "" ? undefined : type,
      name: String(formData.get("name") ?? ""),
      templateId: String(formData.get("templateId") ?? ""),
      contactId: String(formData.get("contactId") ?? ""),
    });
    id = document.id;
  } catch (error) {
    return actionError("documents", error);
  }
  revalidatePath("/app/documents");
  redirect(`/app/documents/${id}`);
}

/** Saves the editable parts of a draft; the service validates every field and recomputes totals. */
export async function saveDocumentAction(id: string, input: unknown): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateDocument(db, ctx, id, input);
    revalidatePath("/app/documents");
    revalidatePath(`/app/documents/${id}`);
    return { ok: true, message: "Document saved." };
  } catch (error) {
    return actionError("documents", error);
  }
}

export async function deleteDocumentAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  await deleteDocument(db, ctx, id);
  revalidatePath("/app/documents");
  redirect("/app/documents");
}

export async function addRecipientAction(documentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await addRecipient(db, ctx, documentId, {
      contactId: String(formData.get("contactId") ?? ""),
      kind: String(formData.get("kind") ?? "signer"),
      role: String(formData.get("role") ?? ""),
    });
    revalidatePath(`/app/documents/${documentId}`);
    return { ok: true, message: "Recipient added." };
  } catch (error) {
    return actionError("documents", error);
  }
}

export async function removeRecipientAction(documentId: string, recipientId: string): Promise<void> {
  const { ctx } = await requireMember();
  await removeRecipient(db, ctx, documentId, recipientId);
  revalidatePath(`/app/documents/${documentId}`);
}

export async function moveRecipientAction(documentId: string, recipientId: string, direction: "up" | "down"): Promise<void> {
  const { ctx } = await requireMember();
  await moveRecipient(db, ctx, documentId, recipientId, direction === "up" ? "up" : "down");
  revalidatePath(`/app/documents/${documentId}`);
}
