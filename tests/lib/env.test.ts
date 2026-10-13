import { describe, expect, it } from "vitest";
import {
  EnvError,
  enabledSocialProviders,
  isSmtpConfigured,
  parseEnv,
  requiresEmailVerification,
} from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("applies defaults for a minimal valid environment", () => {
    const env = parseEnv(base);
    expect(env.DEPLOYMENT_MODE).toBe("self-hosted");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.MICROSOFT_TENANT_ID).toBe("common");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, SMTP_HOST: "", GOOGLE_CLIENT_ID: "" });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("rejects a short auth secret with a readable message", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(EnvError);
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses hosted mode until Phase 2", () => {
    expect(() => parseEnv({ ...base, DEPLOYMENT_MODE: "hosted" })).toThrow(/Phase 2/);
  });

  it("parses SMTP_SECURE=true", () => {
    expect(parseEnv({ ...base, SMTP_SECURE: "true" }).SMTP_SECURE).toBe(true);
  });
});

describe("proxy settings", () => {
  it("leaves proxy lists unset by default", () => {
    const env = parseEnv(base);
    expect(env.AUTH_IP_ADDRESS_HEADERS).toBeUndefined();
    expect(env.AUTH_TRUSTED_PROXIES).toBeUndefined();
  });

  it("parses comma-separated lists, trimming and dropping empties", () => {
    const env = parseEnv({
      ...base,
      AUTH_IP_ADDRESS_HEADERS: " x-forwarded-for , ,cf-connecting-ip,",
      AUTH_TRUSTED_PROXIES: "192.0.2.10, 10.0.0.0/24",
    });
    expect(env.AUTH_IP_ADDRESS_HEADERS).toEqual(["x-forwarded-for", "cf-connecting-ip"]);
    expect(env.AUTH_TRUSTED_PROXIES).toEqual(["192.0.2.10", "10.0.0.0/24"]);
  });

  it("treats a list of only separators as unset", () => {
    const env = parseEnv({ ...base, AUTH_IP_ADDRESS_HEADERS: " , ,", AUTH_TRUSTED_PROXIES: "," });
    expect(env.AUTH_IP_ADDRESS_HEADERS).toBeUndefined();
    expect(env.AUTH_TRUSTED_PROXIES).toBeUndefined();
  });
});

describe("enabledSocialProviders", () => {
  it("includes only providers with both id and secret", () => {
    const env = parseEnv({
      ...base,
      GOOGLE_CLIENT_ID: "g-id",
      GOOGLE_CLIENT_SECRET: "g-secret",
      SLACK_CLIENT_ID: "s-id",
      MICROSOFT_CLIENT_ID: "m-id",
      MICROSOFT_CLIENT_SECRET: "m-secret",
      MICROSOFT_TENANT_ID: "contoso",
    });
    const providers = enabledSocialProviders(env);
    expect(Object.keys(providers).sort()).toEqual(["google", "microsoft"]);
    expect(providers.google).toEqual({ clientId: "g-id", clientSecret: "g-secret" });
    expect(providers.microsoft).toEqual({ clientId: "m-id", clientSecret: "m-secret", tenantId: "contoso" });
  });
});

describe("SMTP helpers", () => {
  it("requires host and from address to count as configured", () => {
    expect(isSmtpConfigured(parseEnv(base))).toBe(false);
    expect(isSmtpConfigured(parseEnv({ ...base, SMTP_HOST: "smtp.example.com" }))).toBe(false);
    const configured = parseEnv({ ...base, SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "noreply@example.com" });
    expect(isSmtpConfigured(configured)).toBe(true);
  });

  it("does not require email verification when SMTP is missing", () => {
    expect(requiresEmailVerification(parseEnv(base))).toBe(false);
    const configured = parseEnv({ ...base, SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "noreply@example.com" });
    expect(requiresEmailVerification(configured)).toBe(true);
  });
});
