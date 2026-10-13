"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/server/auth/session";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { invitationEmail } from "@/server/mail/templates";
import { createInvitation } from "@/server/org/invitations";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/org/settings";
import { sendTestEmail } from "@/server/org/test-email";

export type ActionState = { ok: boolean; message: string } | null;

function toMessage(error: unknown): string {
  if (error instanceof ForbiddenError || error instanceof ValidationError) return error.message;
  console.error("[settings]", error);
  return "Something went wrong. Check the server logs.";
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateOrganizationSettings(db, ctx, {
      name: formData.get("name"),
      senderName: formData.get("senderName"),
      replyToEmail: formData.get("replyToEmail"),
      allowedSignupDomains: String(formData.get("allowedSignupDomains") ?? "").split(","),
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, user } = await requireMember();
  try {
    const invitation = await createInvitation(db, ctx, { email: String(formData.get("email") ?? "") });
    const env = getEnv();
    const url = new URL(
      `/sign-up?invite=${encodeURIComponent(invitation.token)}`,
      env.BETTER_AUTH_URL,
    ).toString();
    const org = await getOrganizationSettings(db, ctx);
    try {
      await createMailerFromEnv(env).send({
        to: invitation.email,
        ...invitationEmail({ organizationName: org.name, inviterName: user.name, url }),
        fromName: org.senderName ?? org.name,
        replyTo: org.replyToEmail ?? undefined,
      });
    } catch (mailError) {
      const reason = mailError instanceof Error ? mailError.message : String(mailError);
      return { ok: false, message: `Invitation created, but the email failed (${reason}). Share this link: ${url}` };
    }
    return { ok: true, message: `Invitation sent to ${invitation.email}.` };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function sendTestEmailAction(): Promise<ActionState> {
  const { ctx, user } = await requireMember();
  const org = await getOrganizationSettings(db, ctx);
  const result = await sendTestEmail(createMailerFromEnv(getEnv()), org, user.email);
  return result.ok
    ? { ok: true, message: `Test email sent to ${user.email}.` }
    : { ok: false, message: result.error };
}
