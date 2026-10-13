import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { invitations, members, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { ValidationError } from "@/server/errors";
import { assertOwner, type OrgContext } from "@/server/tenancy";

export const INVITATION_TTL_DAYS = 7;

export type InvitationRecord = {
  id: string;
  organizationId: string;
  email: string;
  expiresAt: Date;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const record = {
  id: invitations.id,
  organizationId: invitations.organizationId,
  email: invitations.email,
  expiresAt: invitations.expiresAt,
};

export async function createInvitation(
  db: Db,
  ctx: OrgContext,
  input: { email: string },
  now: Date = new Date(),
): Promise<{ invitationId: string; token: string; email: string; expiresAt: Date }> {
  assertOwner(ctx);
  const email = normalizeEmail(input.email);
  if (!z.email().safeParse(email).success) {
    throw new ValidationError("Enter a valid email address.");
  }

  const [existingMember] = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.organizationId, ctx.organizationId), eq(user.email, email)))
    .limit(1);
  if (existingMember) {
    throw new ValidationError(`${email} is already a member.`);
  }

  // A new invitation replaces any earlier pending one for the same address.
  await db
    .delete(invitations)
    .where(
      and(
        eq(invitations.organizationId, ctx.organizationId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invitations)
    .values({
      organizationId: ctx.organizationId,
      email,
      tokenHash: hashToken(token),
      invitedByUserId: ctx.userId,
      expiresAt,
    })
    .returning({ id: invitations.id });

  return { invitationId: row.id, token, email, expiresAt };
}

export async function findInvitationByToken(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<InvitationRecord | null> {
  const [row] = await db
    .select(record)
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findPendingInvitationByEmail(
  db: Db,
  organizationId: string,
  email: string,
  now: Date = new Date(),
): Promise<InvitationRecord | null> {
  const [row] = await db
    .select(record)
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.email, normalizeEmail(email)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markInvitationAccepted(
  db: Db,
  invitationId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitationId));
}
