import { eq } from "drizzle-orm";
import { organizations } from "@/db/schema";
import type { Db } from "@/db/types";

export const DEFAULT_ORG_SLUG = "default";

// Self-hosted installs have exactly one organization. The unique slug makes
// concurrent first requests converge on the same row.
export async function ensureOrganization(db: Db, name = "My Organization"): Promise<string> {
  await db
    .insert(organizations)
    .values({ slug: DEFAULT_ORG_SLUG, name })
    .onConflictDoNothing({ target: organizations.slug });
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, DEFAULT_ORG_SLUG))
    .limit(1);
  return org.id;
}
