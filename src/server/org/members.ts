import { asc, eq } from "drizzle-orm";
import { members, user } from "@/db/schema";
import type { Db } from "@/db/types";
import type { OrgContext, Role } from "@/server/tenancy";

export type MemberSummary = {
  userId: string;
  name: string;
  email: string;
  role: Role;
};

export async function listMembers(db: Db, ctx: OrgContext): Promise<MemberSummary[]> {
  return db
    .select({ userId: user.id, name: user.name, email: user.email, role: members.role })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(eq(members.organizationId, ctx.organizationId))
    .orderBy(asc(members.createdAt));
}
