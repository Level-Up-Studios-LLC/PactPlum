import { eq } from "drizzle-orm";
import { z } from "zod";
import { organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ValidationError } from "@/server/errors";
import { assertOwner, type OrgContext } from "@/server/tenancy";

export type OrganizationSettings = {
  id: string;
  name: string;
  senderName: string | null;
  replyToEmail: string | null;
  defaultCurrency: string;
  allowedSignupDomains: string[];
};

const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const SettingsInput = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
  senderName: z.preprocess(blankToNull, z.string().trim().max(120).nullable().optional()),
  replyToEmail: z.preprocess(
    blankToNull,
    z
      .email("Reply-to must be an email address")
      .transform((v) => v.trim().toLowerCase())
      .nullable()
      .optional(),
  ),
  allowedSignupDomains: z
    .array(z.string())
    .default([])
    .transform((domains) =>
      domains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter((d) => d.length > 0),
    )
    .refine((domains) => domains.every((d) => DOMAIN_PATTERN.test(d)), {
      message: "Allowed domains must look like example.com",
    }),
});

const columns = {
  id: organizations.id,
  name: organizations.name,
  senderName: organizations.senderName,
  replyToEmail: organizations.replyToEmail,
  defaultCurrency: organizations.defaultCurrency,
  allowedSignupDomains: organizations.allowedSignupDomains,
};

export async function getOrganizationSettings(db: Db, ctx: OrgContext): Promise<OrganizationSettings> {
  const [org] = await db
    .select(columns)
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
    .limit(1);
  return org;
}

export async function updateOrganizationSettings(
  db: Db,
  ctx: OrgContext,
  input: unknown,
): Promise<OrganizationSettings> {
  assertOwner(ctx);
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid settings");
  }
  const [org] = await db
    .update(organizations)
    .set({
      name: parsed.data.name,
      senderName: parsed.data.senderName ?? null,
      replyToEmail: parsed.data.replyToEmail ?? null,
      allowedSignupDomains: parsed.data.allowedSignupDomains,
    })
    .where(eq(organizations.id, ctx.organizationId))
    .returning(columns);
  return org;
}
