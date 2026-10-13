import { eq } from "drizzle-orm";
import { members } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError } from "./errors";

export type Role = "owner" | "member";

export type OrgContext = {
  organizationId: string;
  userId: string;
  role: Role;
};

export async function getOrgContext(db: Db, userId: string): Promise<OrgContext | null> {
  const [membership] = await db
    .select({ organizationId: members.organizationId, role: members.role })
    .from(members)
    .where(eq(members.userId, userId))
    .limit(1);
  if (!membership) return null;
  return { organizationId: membership.organizationId, userId, role: membership.role };
}

export function assertOwner(ctx: OrgContext): void {
  if (ctx.role !== "owner") {
    throw new ForbiddenError("Only the organization owner can do that.");
  }
}
