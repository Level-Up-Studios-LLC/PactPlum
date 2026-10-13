import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { getOrgContext, type OrgContext } from "@/server/tenancy";
import { auth } from "./auth";

export async function requireMember(): Promise<{
  ctx: OrgContext;
  user: { id: string; name: string; email: string };
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const ctx = await getOrgContext(db, session.user.id);
  if (!ctx) redirect("/no-access");
  return {
    ctx,
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  };
}
