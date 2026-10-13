import type { Mailer } from "@/server/mail/mailer";
import { testEmail } from "@/server/mail/templates";
import type { OrganizationSettings } from "@/server/org/settings";

export async function sendTestEmail(
  mailer: Mailer,
  org: Pick<OrganizationSettings, "name" | "senderName" | "replyToEmail">,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await mailer.send({
      to,
      ...testEmail(org.name),
      fromName: org.senderName ?? org.name,
      replyTo: org.replyToEmail ?? undefined,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
