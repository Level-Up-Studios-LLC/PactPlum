"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { createDocument, deleteDocument, updateDocument } from "@/server/documents/documents";
import { addRecipient, moveRecipient, removeRecipient } from "@/server/documents/recipients";
import { type ActionState, actionError, formValues } from "../action-state";

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  const values = formValues(formData, ["templateId", "contactId", "type", "name"]);
  let id: string;
  try {
    const document = await createDocument(db, ctx, {
      type: values.type === "" ? undefined : values.type,
      name: values.name,
      templateId: values.templateId,
      contactId: values.contactId,
    });
    id = document.id;
  } catch (error) {
    return actionError("documents", error, values);
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
  try {
    await deleteDocument(db, ctx, id);
  } catch (error) {
    // Already gone counts as deleted.
    if (!(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/app/documents");
  redirect("/app/documents");
}

export async function addRecipientAction(documentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  const values = formValues(formData, ["contactId", "kind", "role"]);
  try {
    await addRecipient(db, ctx, documentId, {
      contactId: values.contactId,
      kind: values.kind || "signer",
      role: values.role,
    });
    revalidatePath(`/app/documents/${documentId}`);
    return { ok: true, message: "Recipient added." };
  } catch (error) {
    return actionError("documents", error, values);
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
