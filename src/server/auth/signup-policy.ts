import type { Role } from "@/server/tenancy";

export type SignUpDecision =
  | { allowed: true; role: Role; invitationId?: string }
  | { allowed: false; reason: "missing_email" | "not_invited" };

export const SIGN_UP_MESSAGES = {
  missing_email: "Your sign-in provider did not share a verified email address. Use another sign-in method.",
  not_invited: "This PactPlum workspace is invite-only. Ask the owner for an invitation.",
} as const;

export const SIGN_IN_REFUSED_MESSAGE =
  "We couldn't sign you in. This PactPlum workspace is invite-only, and your sign-in provider must share a verified email address.";

export function decideSignUp(input: {
  email: string;
  hasOwner: boolean;
  invitation: { id: string } | null;
  allowedDomains: string[];
}): SignUpDecision {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { allowed: false, reason: "missing_email" };
  if (!input.hasOwner) return { allowed: true, role: "owner" };
  if (input.invitation) return { allowed: true, role: "member", invitationId: input.invitation.id };
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (input.allowedDomains.some((allowed) => allowed.toLowerCase() === domain)) {
    return { allowed: true, role: "member" };
  }
  return { allowed: false, reason: "not_invited" };
}
