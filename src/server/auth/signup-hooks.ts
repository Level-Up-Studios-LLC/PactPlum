import { and, eq } from "drizzle-orm";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureOrganization } from "@/server/org/bootstrap";
import { findPendingInvitationByEmail, markInvitationAccepted, normalizeEmail } from "@/server/org/invitations";
import type { Role } from "@/server/tenancy";
import { decideSignUp, type SignUpDecision } from "./signup-policy";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function resolveSignUp(
  db: Db,
  email: string | null | undefined,
  now: Date = new Date(),
): Promise<SignUpDecision> {
  const organizationId = await ensureOrganization(db);
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

export async function applySignUp(
  db: Db,
  userId: string,
  email: string,
  now: Date = new Date(),
): Promise<Role | null> {
  const decision = await resolveSignUp(db, email, now);
  const organizationId = await ensureOrganization(db);
  return applyDecision(db, organizationId, userId, decision, now);
}
