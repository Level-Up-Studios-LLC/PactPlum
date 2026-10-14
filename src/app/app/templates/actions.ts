"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { createTemplate, deleteTemplate, duplicateTemplate, updateTemplate } from "@/server/templates/templates";
import { type ActionState, actionError, formValues } from "../action-state";

export async function createTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  const values = formValues(formData, ["name", "documentType"]);
  let id: string;
  try {
    const template = await createTemplate(db, ctx, {
      name: values.name,
      documentType: values.documentType || "proposal",
    });
    id = template.id;
  } catch (error) {
    return actionError("templates", error, values);
  }
  revalidatePath("/app/templates");
  redirect(`/app/templates/${id}`);
}

/** Saves the whole template; the service validates every field. */
export async function saveTemplateAction(id: string, input: unknown): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    const template = await updateTemplate(db, ctx, id, input);
    revalidatePath("/app/templates");
    revalidatePath(`/app/templates/${id}`);
    return { ok: true, message: "Template saved.", version: template.version };
  } catch (error) {
    return actionError("templates", error);
  }
}

export async function duplicateTemplateAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  const copy = await duplicateTemplate(db, ctx, id);
  revalidatePath("/app/templates");
  redirect(`/app/templates/${copy.id}`);
}

export async function deleteTemplateAction(id: string): Promise<void> {
  const { ctx } = await requireMember();
  try {
    await deleteTemplate(db, ctx, id);
  } catch (error) {
    // Already gone counts as deleted.
    if (!(error instanceof NotFoundError)) throw error;
  }
  revalidatePath("/app/templates");
  redirect("/app/templates");
}
