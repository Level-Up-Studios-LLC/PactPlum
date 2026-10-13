import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

const EnvSchema = z.object({
  DEPLOYMENT_MODE: z.enum(["self-hosted", "hosted"]).default("self-hosted"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a full URL, e.g. http://localhost:3000"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM_EMAIL: z.email("SMTP_FROM_EMAIL must be an email address").optional(),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  MICROSOFT_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_TENANT_ID: z.string().trim().min(1).default("common"),
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  if (result.data.DEPLOYMENT_MODE === "hosted") {
    throw new EnvError(
      "DEPLOYMENT_MODE=hosted is not available yet (planned for Phase 2). Use DEPLOYMENT_MODE=self-hosted.",
    );
  }
  return result.data;
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export type SocialProviderId = "google" | "microsoft" | "linkedin" | "slack";

export type SocialProviderConfig = {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
};

export function enabledSocialProviders(env: Env): Partial<Record<SocialProviderId, SocialProviderConfig>> {
  const providers: Partial<Record<SocialProviderId, SocialProviderConfig>> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    providers.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: env.MICROSOFT_TENANT_ID,
    };
  }
  if (env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    providers.linkedin = { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET };
  }
  if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) {
    providers.slack = { clientId: env.SLACK_CLIENT_ID, clientSecret: env.SLACK_CLIENT_SECRET };
  }
  return providers;
}

export function isSmtpConfigured(env: Env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM_EMAIL);
}

// Without SMTP nobody could receive a verification link, so verification is
// only enforced once email can actually be sent.
export function requiresEmailVerification(env: Env): boolean {
  return isSmtpConfigured(env);
}
