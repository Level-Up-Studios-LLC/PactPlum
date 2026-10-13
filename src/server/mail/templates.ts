import { APP_NAME } from "@/lib/app-info";

export type EmailContent = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(heading: string, body: string, url?: string, cta?: string): string {
  const button = url
    ? `<p><a href="${escapeHtml(url)}" style="background:#6b2d5c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(cta ?? "Open")}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2>${escapeHtml(heading)}</h2>
<p>${body}</p>
${button}
<p style="color:#666;font-size:12px">Sent by ${APP_NAME}</p>
</div>`;
}

export function verificationEmail(url: string): EmailContent {
  return {
    subject: `Verify your ${APP_NAME} email address`,
    text: `Confirm your email address by opening this link:\n${url}\n\nIf you did not sign up, ignore this email.`,
    html: layout("Verify your email", "Confirm your email address to finish signing up.", url, "Verify email"),
  };
}

export function resetPasswordEmail(url: string): EmailContent {
  return {
    subject: `Reset your ${APP_NAME} password`,
    text: `Reset your password by opening this link:\n${url}\n\nIf you did not ask for this, ignore this email.`,
    html: layout("Reset your password", "Use the button below to choose a new password.", url, "Reset password"),
  };
}

export function invitationEmail(input: { organizationName: string; inviterName: string; url: string }): EmailContent {
  const org = escapeHtml(input.organizationName);
  const inviter = escapeHtml(input.inviterName);
  return {
    subject: `${input.inviterName} invited you to ${input.organizationName} on ${APP_NAME}`,
    text: `${input.inviterName} invited you to join ${input.organizationName} on ${APP_NAME}.\nAccept the invitation:\n${input.url}\n\nThe link expires in 7 days.`,
    html: layout(
      `Join ${input.organizationName}`,
      `${inviter} invited you to join <strong>${org}</strong>. The link expires in 7 days.`,
      input.url,
      "Accept invitation",
    ),
  };
}

export function testEmail(organizationName: string): EmailContent {
  return {
    subject: `${APP_NAME} test email for ${organizationName}`,
    text: `Your email settings work. ${APP_NAME} can send email for ${organizationName}.`,
    html: layout("Email is working", `${APP_NAME} can send email for ${escapeHtml(organizationName)}.`),
  };
}
