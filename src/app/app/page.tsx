import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { getOrganizationSettings } from "@/server/org/settings";

export default async function DashboardPage() {
  const { ctx, user } = await requireMember();
  const org = await getOrganizationSettings(db, ctx);
  return (
    <section>
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="mt-2 text-neutral-600">{org.name} · {ctx.role === "owner" ? "Owner" : "Member"}</p>
    </section>
  );
}
