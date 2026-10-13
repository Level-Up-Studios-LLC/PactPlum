import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureOrganization } from "@/server/org/bootstrap";
import { findPendingInvitationByEmail, markInvitationAccepted, normalizeEmail } from "@/server/org/invitations";
import type { Role } from "@/server/tenancy";
import { decideSignUp, SIGN_UP_MESSAGES, type SignUpDecision } from "./signup-policy";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function decideForOrganization(
  db: Db,
  organizationId: string,
  email: string | null | undefined,
  now: Date,
): Promise<SignUpDecision> {
  const normalized = email ? normalizeEmail(email) : "";

  const [owner] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.role, "owner")))
    .limit(1);
  const [org] = await db
    .select({ allowedSignupDomains: organizations.allowedSignupDomains })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const invitation = normalized
    ? await findPendingInvitationByEmail(db, organizationId, normalized, now)
    : null;

  return decideSignUp({
    email: normalized,
    hasOwner: Boolean(owner),
    invitation,
    allowedDomains: org.allowedSignupDomains,
  });
}

export async function resolveSignUp(
  db: Db,
  email: string | null | undefined,
  now: Date = new Date(),
): Promise<SignUpDecision> {
  const organizationId = await ensureOrganization(db);
  return decideForOrganization(db, organizationId, email, now);
}

export async function applyDecision(
  db: Db,
  organizationId: string,
  userId: string,
  decision: SignUpDecision,
  now: Date = new Date(),
): Promise<Role | null> {
  if (!decision.allowed) return null;
  try {
    await db.insert(members).values({ organizationId, userId, role: decision.role });
  } catch (error) {
    // Lost a race for the single owner slot: leave the user without membership.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
  if (decision.invitationId) await markInvitationAccepted(db, decision.invitationId, now);
  return decision.role;
}

async function findMembershipRole(db: Db, organizationId: string, userId: string): Promise<Role | null> {
  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
    .limit(1);
  return membership?.role ?? null;
}

/**
 * Gate for creating a user row: refuses emails that may not have an account and
 * returns the normalized email. Does not grant membership (see admitUser).
 */
export async function beforeUserCreate(
  db: Db,
  user: { email: string },
  now: Date = new Date(),
): Promise<{ email: string }> {
  const decision = await resolveSignUp(db, user.email, now);
  if (!decision.allowed) {
    throw new APIError("FORBIDDEN", {
      code: decision.reason.toUpperCase(),
      message: SIGN_UP_MESSAGES[decision.reason],
    });
  }
  return { email: normalizeEmail(user.email) };
}

/**
 * Grants membership to an eligible user. Idempotent, safe to call on every
 * user create/update and session create. A member is admitted only once the
 * user's email is verified, because invitations and allowed domains are
 * matched on the email address. The first user may be unverified so a fresh
 * install without SMTP can bootstrap its owner.
 */
export async function admitUser(
  db: Db,
  user: { id: string; email: string; emailVerified: boolean },
  now: Date = new Date(),
): Promise<Role | null> {
  const organizationId = await ensureOrganization(db);
  const existing = await findMembershipRole(db, organizationId, user.id);
  if (existing) return existing;

  const decision = await decideForOrganization(db, organizationId, user.email, now);
  if (!decision.allowed) return null;
  if (decision.role === "member" && !user.emailVerified) return null;

  const role = await applyDecision(db, organizationId, user.id, decision, now);
  // A concurrent admit of the same user may have inserted the row first.
  return role ?? (await findMembershipRole(db, organizationId, user.id));
}
