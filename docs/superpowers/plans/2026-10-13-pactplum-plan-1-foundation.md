# PactPlum Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hostable PactPlum skeleton: Next.js app with Postgres, a multi-tenant-ready organization model, email + password and Google/Microsoft/LinkedIn/Slack login with an invite-only sign-up policy, SMTP email, an organization settings page, and the open-source repository files, CI and Docker setup.

**Architecture:** Next.js 16 App Router in TypeScript. Drizzle ORM over Postgres (`postgres` driver at runtime, in-process PGlite in tests). Better Auth handles sessions and providers; database hooks enforce the sign-up policy and create memberships. Domain logic lives in plain functions under `src/server/` that take a `Db` and an `OrgContext`, so it is tested without Next.js. Pages and server actions are thin wrappers.

**Tech Stack:** Node 24, Next.js 16.4, React 19, TypeScript, Tailwind CSS 4, Better Auth 1.7, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres 3.4, PGlite 0.5 (tests), Nodemailer 10, Zod 4, Vitest 5, Docker Compose (Postgres 17, Mailpit).

**Spec:** `docs/superpowers/specs/2026-10-12-proposal-app-design.md`

**Plan series (Phase 1):** Plan 1 Foundation (this) → Plan 2 Content (contacts, catalog, templates, editor, quote engine, documents) → Plan 3 Send and sign (revisions, signing page, audit chain, PDF certificate, expiry) → Plan 4 Payments (PaymentProvider, Stripe Checkout, Stripe Invoicing, webhooks).

## Global Constraints

- License: MIT. Copyright holder: Level Up Studios LLC.
- No third-party product names, branding or captured research data in any repository file. The product name is PactPlum.
- No telemetry by default (`NEXT_TELEMETRY_DISABLED=1` in Docker and CI).
- `DEPLOYMENT_MODE` accepts `self-hosted` and `hosted`; Phase 1 implements only `self-hosted`, and `hosted` fails at startup with a clear message.
- Every tenant-owned table carries `organization_id`; every tenant query receives an `OrgContext` and filters by `ctx.organizationId`.
- Email addresses are stored and compared lowercased and trimmed.
- A login provider is shown and enabled only when both its client id and secret are set.
- Secrets live only in environment variables. `.env` is never committed; `.env.example` lists every variable.
- Roles: `owner | member`. Exactly one owner per organization.
- Clients (document recipients) never need an account. Login guards only `/app/*`.
- Node 24 LTS. Package versions: next 16.4.x, better-auth 1.7.x, @better-auth/drizzle-adapter 1.7.x, drizzle-orm 0.45.x, drizzle-kit 0.31.x, vitest 5.x, zod 4.x, nodemailer 10.x.

## Review Focus

1. A second person signs up (any method) without an invitation or allowed domain → refused with "This PactPlum workspace is invite-only. Ask the owner for an invitation." Test: Task 6, `applySignUp` refuses an uninvited second user.
2. An invitation sent to `Jane@Acme.com` is used by someone signing in as `jane@acme.com` → accepted. Tests: Task 4 case-insensitive lookup; Task 6 invited mixed-case sign-up.
3. A social provider (LinkedIn) returns no email → refused with a readable message, no crash. Test: Task 6 `decideSignUp` with empty email.
4. SMTP is not configured on first boot → the owner can still sign up (verification not required), and "Send test email" reports a readable error. Tests: Task 2 `requiresEmailVerification`; Task 5 unconfigured mailer and `sendTestEmail`.
5. Two people sign up at the same moment on a fresh install → only one becomes owner. Tests: Task 3 one-owner unique index; Task 6 `applySignUp` returns `null` on unique violation.

---

## File Structure

```
.github/workflows/ci.yml            CI: lint, typecheck, test, build, docker build
.dockerignore, Dockerfile           Production image (Task 9)
compose.yaml                        Dev Postgres + Mailpit (Task 3); app service (Task 9)
LICENSE, README.md, CONTRIBUTING.md, SECURITY.md, .env.example
drizzle.config.ts                   drizzle-kit config
drizzle/                            Generated SQL migrations (committed)
scripts/migrate.mjs                 Applies migrations at container start
vitest.config.ts
src/lib/app-info.ts                 Product name and license constants
src/lib/env.ts                      Env parsing, provider and SMTP helpers
src/lib/auth-client.ts              Better Auth React client
src/db/schema/auth.ts               Better Auth tables
src/db/schema/org.ts                organizations, members, invitations
src/db/schema/index.ts              Schema barrel
src/db/types.ts                     Db type shared by runtime and tests
src/db/client.ts                    Runtime Drizzle client (postgres driver)
src/server/errors.ts                ForbiddenError, ValidationError
src/server/tenancy.ts               OrgContext, getOrgContext, assertOwner
src/server/org/bootstrap.ts         ensureOrganization
src/server/org/members.ts           listMembers
src/server/org/settings.ts          get/updateOrganizationSettings
src/server/org/invitations.ts       create/find/accept invitations
src/server/org/test-email.ts        sendTestEmail
src/server/mail/mailer.ts           Mailer interface + SMTP implementation
src/server/mail/templates.ts        Email bodies
src/server/auth/signup-policy.ts    Pure sign-up decision
src/server/auth/signup-hooks.ts     DB-aware resolve/apply sign-up
src/server/auth/auth.ts             Better Auth instance
src/server/auth/session.ts          requireMember for pages and actions
src/app/api/auth/[...all]/route.ts  Better Auth route handler
src/app/(auth)/...                  sign-in, sign-up, forgot/reset password, no-access
src/app/app/...                     Authenticated shell, dashboard, settings
tests/helpers/test-db.ts            PGlite database with migrations applied
tests/**/*.test.ts                  Vitest suites
```

---

### Task 1: Scaffold the app, tooling and open-source files

**Files:**
- Create (scaffold): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `public/*`
- Create: `vitest.config.ts`, `src/lib/app-info.ts`, `tests/lib/app-info.test.ts`
- Create: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.github/workflows/ci.yml`
- Modify: `.gitignore`, `package.json` (scripts)

**Interfaces:**
- Produces: `APP_NAME = "PactPlum"`, `APP_LICENSE = "MIT"` from `@/lib/app-info`; npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`.

- [ ] **Step 1: Scaffold Next.js into the repository root**

The repo already contains `docs/` and `.git/`. Run from the repository root:

```bash
npx create-next-app@16.4.0 . --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes
```

If it refuses because the directory is not empty, scaffold into a sibling folder and copy it in:

```bash
npx create-next-app@16.4.0 ../pactplum-scaffold --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes
cp -r ../pactplum-scaffold/. .
rm -rf ../pactplum-scaffold
npm install
```

Expected: `package.json`, `src/app/page.tsx` and `next.config.ts` exist; `npm run dev` starts on port 3000.

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install better-auth@^1.7.7 @better-auth/drizzle-adapter@^1.7.7 drizzle-orm@^0.45.4 postgres@^3.4.9 nodemailer@^10.1.0 zod@^4.6.7 server-only
npm install -D drizzle-kit@^0.31.11 @electric-sql/pglite@^0.5.9 vitest@^5.0.4 @types/nodemailer@^8.0.2
```

- [ ] **Step 3: Add scripts to `package.json`**

Set the `scripts` block to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "next typegen && tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "node scripts/migrate.mjs"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: Write the failing test `tests/lib/app-info.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { APP_LICENSE, APP_NAME } from "@/lib/app-info";

describe("app info", () => {
  it("names the product and its license", () => {
    expect(APP_NAME).toBe("PactPlum");
    expect(APP_LICENSE).toBe("MIT");
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run tests/lib/app-info.test.ts`
Expected: FAIL, cannot resolve `@/lib/app-info`.

- [ ] **Step 7: Create `src/lib/app-info.ts`**

```ts
export const APP_NAME = "PactPlum";
export const APP_LICENSE = "MIT";
export const APP_REPOSITORY_URL = "https://github.com/Level-Up-Studios-LLC/PactPlum";
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `npx vitest run tests/lib/app-info.test.ts`
Expected: PASS (1 test).

- [ ] **Step 9: Create the open-source files**

`LICENSE`:

```text
MIT License

Copyright (c) 2026 Level Up Studios LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md` (expanded in Task 9):

```markdown
# PactPlum

Open-source proposals, quotes, contracts and invoices with e-signatures and Stripe payments. Free to self-host under the MIT license.

> Status: early development. Not ready for production use.

## Quick start (development)

1. Install Node 24 and Docker.
2. `cp .env.example .env` and set `BETTER_AUTH_SECRET` (run `openssl rand -base64 32`).
3. `docker compose up -d` to start Postgres and Mailpit.
4. `npm install`, then `npm run db:migrate`.
5. `npm run dev` and open http://localhost:3000.

## License

MIT. See [LICENSE](LICENSE).
```

`CONTRIBUTING.md`:

```markdown
# Contributing to PactPlum

Thanks for helping. Before opening a pull request:

1. Open an issue describing the change, unless it is a small fix.
2. Run `npm run lint`, `npm run typecheck` and `npm test`. All must pass.
3. Add or update tests for behavior you change.
4. Keep pull requests focused on one change.

By contributing you agree that your contributions are licensed under the MIT license.
```

`SECURITY.md`:

```markdown
# Security policy

Please do not report security vulnerabilities in public issues.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. We aim to acknowledge reports within 5 business days.

Supported versions: the latest release on the `main` branch.
```

`.env.example`:

```bash
# Deployment mode. Phase 1 supports only self-hosted.
DEPLOYMENT_MODE=self-hosted

# Postgres connection string.
DATABASE_URL=postgres://pactplum:pactplum@localhost:5432/pactplum

# Better Auth. Secret must be at least 32 characters (openssl rand -base64 32).
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# SMTP (any provider). Leave SMTP_HOST empty to disable email.
# Local development uses Mailpit from compose.yaml: host localhost, port 1025.
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@pactplum.local

# Optional login providers. A provider is enabled only when both values are set.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

Append to `.gitignore`:

```gitignore
# keep the example env file
!.env.example
```

- [ ] **Step 10: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    env:
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          DATABASE_URL: postgres://build:build@localhost:5432/build
          BETTER_AUTH_SECRET: ci-build-placeholder-secret-0123456789abcdef
          BETTER_AUTH_URL: http://localhost:3000
```

- [ ] **Step 11: Verify tooling**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all three succeed.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with tooling, CI and open-source files"
```

---

### Task 2: Environment configuration

**Files:**
- Create: `src/lib/env.ts`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces:
  - `type Env` (parsed, typed environment)
  - `class EnvError extends Error`
  - `parseEnv(source: Record<string, string | undefined>): Env`
  - `getEnv(): Env` (memoized `parseEnv(process.env)`)
  - `type SocialProviderId = "google" | "microsoft" | "linkedin" | "slack"`
  - `type SocialProviderConfig = { clientId: string; clientSecret: string; tenantId?: string }`
  - `enabledSocialProviders(env: Env): Partial<Record<SocialProviderId, SocialProviderConfig>>`
  - `isSmtpConfigured(env: Env): boolean`
  - `requiresEmailVerification(env: Env): boolean`

- [ ] **Step 1: Write the failing tests `tests/lib/env.test.ts`**

```ts
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: FAIL, cannot resolve `@/lib/env`.

- [ ] **Step 3: Implement `src/lib/env.ts`**

```ts
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
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts tests/lib/env.test.ts
git commit -m "feat: parse and validate environment configuration"
```

---

### Task 3: Database schema, migrations, test database and organization bootstrap

**Files:**
- Create: `src/db/schema/auth.ts`, `src/db/schema/org.ts`, `src/db/schema/index.ts`, `src/db/types.ts`, `src/db/client.ts`
- Create: `drizzle.config.ts`, `scripts/migrate.mjs`, `compose.yaml`, `drizzle/` (generated)
- Create: `src/server/org/bootstrap.ts`
- Create: `tests/helpers/test-db.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: `getEnv()` from Task 2.
- Produces:
  - Tables `user`, `session`, `account`, `verification`, `organizations`, `members`, `invitations`; enum `memberRole` (`"owner" | "member"`)
  - `type Db` from `@/db/types`
  - `db: Db` from `@/db/client` (runtime only; never imported by tests)
  - `DEFAULT_ORG_SLUG = "default"`, `ensureOrganization(db: Db, name?: string): Promise<string>` from `@/server/org/bootstrap`
  - Test helpers `createTestDb(): Promise<{ db: Db; close: () => Promise<void> }>` and `insertUser(db: Db, email: string, name?: string): Promise<string>`

- [ ] **Step 1: Create `compose.yaml` for local development**

```yaml
services:
  db:
    image: postgres:17.10-alpine
    environment:
      POSTGRES_USER: pactplum
      POSTGRES_PASSWORD: pactplum
      POSTGRES_DB: pactplum
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pactplum"]
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit:v1.31.3
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  pgdata: {}
```

- [ ] **Step 2: Create `src/db/schema/auth.ts`**

```ts
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
```

- [ ] **Step 3: Create `src/db/schema/org.ts`**

```ts
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const organizations = pgTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  senderName: text("sender_name"),
  replyToEmail: text("reply_to_email"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  allowedSignupDomains: text("allowed_signup_domains")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("members_org_user_idx").on(table.organizationId, table.userId),
    // Exactly one owner per organization, enforced by the database so two
    // simultaneous first sign-ups cannot both become owner.
    uniqueIndex("members_one_owner_idx").on(table.organizationId).where(sql`role = 'owner'`),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("invitations_org_email_idx").on(table.organizationId, table.email)],
);
```

- [ ] **Step 4: Create `src/db/schema/index.ts`, `src/db/types.ts`, `src/db/client.ts`**

`src/db/schema/index.ts`:

```ts
export * from "./auth";
export * from "./org";
```

`src/db/types.ts`:

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// Shared by the runtime postgres driver and the PGlite test driver.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
```

`src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
import type { Db } from "./types";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pactplumSql?: ReturnType<typeof postgres> };

const sql = globalForDb.pactplumSql ?? postgres(getEnv().DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pactplumSql = sql;

export const db: Db = drizzle({ client: sql, schema });
```

- [ ] **Step 5: Create `drizzle.config.ts` and `scripts/migrate.mjs`**

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

`scripts/migrate.mjs`:

```js
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await sql.end();
}
```

- [ ] **Step 6: Generate the initial migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0000_*.sql` file containing `CREATE TABLE "user"`, `CREATE TABLE "organizations"`, `CREATE TYPE "public"."member_role"` and `CREATE UNIQUE INDEX "members_one_owner_idx" ... WHERE role = 'owner'`.

- [ ] **Step 7: Create `tests/helpers/test-db.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}

export async function insertUser(db: Db, email: string, name = "Test User"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.user).values({ id, email, name, emailVerified: true });
  return id;
}
```

- [ ] **Step 8: Write the failing tests `tests/db/schema.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureOrganization } from "@/server/org/bootstrap";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

describe("ensureOrganization", () => {
  it("creates the default organization once and returns the same id", async () => {
    const first = await ensureOrganization(db, "Acme");
    const second = await ensureOrganization(db, "Other name");
    expect(second).toBe(first);
    const rows = await db.select().from(organizations);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Acme");
    expect(rows[0].allowedSignupDomains).toEqual([]);
  });
});

describe("members constraints", () => {
  it("allows only one owner per organization", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    const b = await insertUser(db, "b@example.com");
    await db.insert(members).values({ organizationId, userId: a, role: "owner" });
    await expect(
      db.insert(members).values({ organizationId, userId: b, role: "owner" }),
    ).rejects.toThrow();
  });

  it("allows many members alongside the owner", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    const b = await insertUser(db, "b@example.com");
    const c = await insertUser(db, "c@example.com");
    await db.insert(members).values([
      { organizationId, userId: a, role: "owner" },
      { organizationId, userId: b, role: "member" },
      { organizationId, userId: c, role: "member" },
    ]);
    expect(await db.select().from(members)).toHaveLength(3);
  });

  it("prevents the same user joining an organization twice", async () => {
    const organizationId = await ensureOrganization(db);
    const a = await insertUser(db, "a@example.com");
    await db.insert(members).values({ organizationId, userId: a, role: "member" });
    await expect(
      db.insert(members).values({ organizationId, userId: a, role: "member" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 9: Run and confirm failure**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL, cannot resolve `@/server/org/bootstrap`.

- [ ] **Step 10: Implement `src/server/org/bootstrap.ts`**

```ts
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
```

- [ ] **Step 11: Run and confirm pass**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 12: Verify migrations against real Postgres**

```bash
docker compose up -d db mailpit
cp .env.example .env   # then set BETTER_AUTH_SECRET to a 32+ character value
npm run db:migrate
```

Expected: `Migrations applied.`

- [ ] **Step 13: Commit**

```bash
git add compose.yaml drizzle.config.ts drizzle scripts src/db src/server/org/bootstrap.ts tests/helpers tests/db
git commit -m "feat: add database schema, migrations and organization bootstrap"
```

---

### Task 4: Tenancy, members, organization settings and invitations

**Files:**
- Create: `src/server/errors.ts`, `src/server/tenancy.ts`, `src/server/org/members.ts`, `src/server/org/settings.ts`, `src/server/org/invitations.ts`
- Test: `tests/server/tenancy.test.ts`, `tests/server/settings.test.ts`, `tests/server/invitations.test.ts`

**Interfaces:**
- Consumes: `Db`, tables, `ensureOrganization`, `createTestDb`, `insertUser` (Task 3).
- Produces:
  - `class ForbiddenError extends Error`, `class ValidationError extends Error` from `@/server/errors`
  - `type Role = "owner" | "member"`, `type OrgContext = { organizationId: string; userId: string; role: Role }`
  - `getOrgContext(db: Db, userId: string): Promise<OrgContext | null>`, `assertOwner(ctx: OrgContext): void`
  - `type MemberSummary = { userId: string; name: string; email: string; role: Role }`, `listMembers(db: Db, ctx: OrgContext): Promise<MemberSummary[]>`
  - `type OrganizationSettings = { id: string; name: string; senderName: string | null; replyToEmail: string | null; defaultCurrency: string; allowedSignupDomains: string[] }`
  - `getOrganizationSettings(db: Db, ctx: OrgContext): Promise<OrganizationSettings>`
  - `updateOrganizationSettings(db: Db, ctx: OrgContext, input: unknown): Promise<OrganizationSettings>`
  - `INVITATION_TTL_DAYS = 7`, `normalizeEmail(email: string): string`, `hashToken(token: string): string`
  - `type InvitationRecord = { id: string; organizationId: string; email: string; expiresAt: Date }`
  - `createInvitation(db: Db, ctx: OrgContext, input: { email: string }, now?: Date): Promise<{ invitationId: string; token: string; email: string; expiresAt: Date }>`
  - `findInvitationByToken(db: Db, token: string, now?: Date): Promise<InvitationRecord | null>`
  - `findPendingInvitationByEmail(db: Db, organizationId: string, email: string, now?: Date): Promise<InvitationRecord | null>`
  - `markInvitationAccepted(db: Db, invitationId: string, now?: Date): Promise<void>`

- [ ] **Step 1: Write the failing tests `tests/server/tenancy.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError } from "@/server/errors";
import { listMembers } from "@/server/org/members";
import { assertOwner, getOrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

async function seedTwoOrganizations() {
  const [orgA] = await db.insert(organizations).values({ slug: "a", name: "Org A" }).returning();
  const [orgB] = await db.insert(organizations).values({ slug: "b", name: "Org B" }).returning();
  const alice = await insertUser(db, "alice@a.com", "Alice");
  const bob = await insertUser(db, "bob@b.com", "Bob");
  await db.insert(members).values([
    { organizationId: orgA.id, userId: alice, role: "owner" },
    { organizationId: orgB.id, userId: bob, role: "owner" },
  ]);
  return { orgA, orgB, alice, bob };
}

describe("tenancy", () => {
  it("resolves the organization context for a member", async () => {
    const { orgA, alice } = await seedTwoOrganizations();
    expect(await getOrgContext(db, alice)).toEqual({ organizationId: orgA.id, userId: alice, role: "owner" });
  });

  it("returns null for a user without membership", async () => {
    const stranger = await insertUser(db, "stranger@x.com");
    expect(await getOrgContext(db, stranger)).toBeNull();
  });

  it("never lists members of another organization", async () => {
    const { alice } = await seedTwoOrganizations();
    const ctx = (await getOrgContext(db, alice))!;
    const result = await listMembers(db, ctx);
    expect(result.map((m) => m.email)).toEqual(["alice@a.com"]);
  });

  it("assertOwner rejects members", () => {
    expect(() => assertOwner({ organizationId: "o", userId: "u", role: "member" })).toThrow(ForbiddenError);
    expect(() => assertOwner({ organizationId: "o", userId: "u", role: "owner" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Write the failing tests `tests/server/settings.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { members } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { ensureOrganization } from "@/server/org/bootstrap";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/org/settings";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let owner: OrgContext;
let member: OrgContext;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const organizationId = await ensureOrganization(db, "Acme");
  const ownerId = await insertUser(db, "owner@acme.com");
  const memberId = await insertUser(db, "member@acme.com");
  await db.insert(members).values([
    { organizationId, userId: ownerId, role: "owner" },
    { organizationId, userId: memberId, role: "member" },
  ]);
  owner = { organizationId, userId: ownerId, role: "owner" };
  member = { organizationId, userId: memberId, role: "member" };
});
afterEach(async () => {
  await close();
});

describe("organization settings", () => {
  it("normalizes and saves settings for the owner", async () => {
    const saved = await updateOrganizationSettings(db, owner, {
      name: "  Acme Ltd ",
      senderName: "Acme Proposals",
      replyToEmail: "Sales@Acme.com",
      allowedSignupDomains: [" Acme.com", "@partner.io", ""],
    });
    expect(saved.name).toBe("Acme Ltd");
    expect(saved.replyToEmail).toBe("sales@acme.com");
    expect(saved.allowedSignupDomains).toEqual(["acme.com", "partner.io"]);
    expect(await getOrganizationSettings(db, member)).toEqual(saved);
  });

  it("stores blank optional fields as null", async () => {
    const saved = await updateOrganizationSettings(db, owner, {
      name: "Acme",
      senderName: "",
      replyToEmail: "",
      allowedSignupDomains: [],
    });
    expect(saved.senderName).toBeNull();
    expect(saved.replyToEmail).toBeNull();
  });

  it("rejects an invalid domain with a readable message", async () => {
    await expect(
      updateOrganizationSettings(db, owner, { name: "Acme", allowedSignupDomains: ["not a domain"] }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses updates from a member", async () => {
    await expect(updateOrganizationSettings(db, member, { name: "Hacked" })).rejects.toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 3: Write the failing tests `tests/server/invitations.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invitations, members } from "@/db/schema";
import type { Db } from "@/db/types";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { ensureOrganization } from "@/server/org/bootstrap";
import {
  createInvitation,
  findInvitationByToken,
  findPendingInvitationByEmail,
  hashToken,
  markInvitationAccepted,
} from "@/server/org/invitations";
import type { OrgContext } from "@/server/tenancy";
import { createTestDb, insertUser } from "../helpers/test-db";

let db: Db;
let close: () => Promise<void>;
let owner: OrgContext;
let member: OrgContext;

const now = new Date("2026-10-13T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const organizationId = await ensureOrganization(db, "Acme");
  const ownerId = await insertUser(db, "owner@acme.com");
  const memberId = await insertUser(db, "member@acme.com");
  await db.insert(members).values([
    { organizationId, userId: ownerId, role: "owner" },
    { organizationId, userId: memberId, role: "member" },
  ]);
  owner = { organizationId, userId: ownerId, role: "owner" };
  member = { organizationId, userId: memberId, role: "member" };
});
afterEach(async () => {
  await close();
});

describe("invitations", () => {
  it("stores only a hash of the token and normalizes the email", async () => {
    const created = await createInvitation(db, owner, { email: "  Jane@Acme.com " }, now);
    expect(created.email).toBe("jane@acme.com");
    expect(created.expiresAt.getTime()).toBe(now.getTime() + 7 * day);
    const [row] = await db.select().from(invitations);
    expect(row.tokenHash).toBe(hashToken(created.token));
    expect(row.tokenHash).not.toBe(created.token);
  });

  it("finds a pending invitation by email regardless of case", async () => {
    await createInvitation(db, owner, { email: "Jane@Acme.com" }, now);
    const found = await findPendingInvitationByEmail(db, owner.organizationId, "JANE@acme.COM", now);
    expect(found?.email).toBe("jane@acme.com");
  });

  it("finds an invitation by token until it expires", async () => {
    const { token } = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    expect(await findInvitationByToken(db, token, now)).not.toBeNull();
    expect(await findInvitationByToken(db, token, new Date(now.getTime() + 8 * day))).toBeNull();
    expect(await findInvitationByToken(db, "wrong-token", now)).toBeNull();
  });

  it("does not return an accepted invitation", async () => {
    const { token, invitationId } = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    await markInvitationAccepted(db, invitationId, now);
    expect(await findInvitationByToken(db, token, now)).toBeNull();
    expect(await findPendingInvitationByEmail(db, owner.organizationId, "jane@acme.com", now)).toBeNull();
  });

  it("replaces an earlier pending invitation for the same email", async () => {
    const first = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    const second = await createInvitation(db, owner, { email: "jane@acme.com" }, now);
    expect(await findInvitationByToken(db, first.token, now)).toBeNull();
    expect(await findInvitationByToken(db, second.token, now)).not.toBeNull();
  });

  it("refuses to invite an existing member", async () => {
    await expect(createInvitation(db, owner, { email: "Member@acme.com" }, now)).rejects.toThrow(ValidationError);
  });

  it("refuses an invalid email", async () => {
    await expect(createInvitation(db, owner, { email: "nope" }, now)).rejects.toThrow(ValidationError);
  });

  it("only the owner can invite", async () => {
    await expect(createInvitation(db, member, { email: "x@acme.com" }, now)).rejects.toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 4: Run and confirm failure**

Run: `npx vitest run tests/server`
Expected: FAIL, cannot resolve `@/server/errors`, `@/server/tenancy` and the org modules.

- [ ] **Step 5: Implement `src/server/errors.ts` and `src/server/tenancy.ts`**

`src/server/errors.ts`:

```ts
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
```

`src/server/tenancy.ts`:

```ts
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
```

- [ ] **Step 6: Implement `src/server/org/members.ts`**

```ts
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
```

- [ ] **Step 7: Implement `src/server/org/settings.ts`**

```ts
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
```

- [ ] **Step 8: Implement `src/server/org/invitations.ts`**

```ts
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
```

- [ ] **Step 9: Run and confirm pass**

Run: `npx vitest run tests/server`
Expected: PASS (16 tests across 3 files).

- [ ] **Step 10: Commit**

```bash
git add src/server tests/server
git commit -m "feat: add tenancy context, organization settings and invitations"
```

---

### Task 5: Mailer, email templates and test email

**Files:**
- Create: `src/server/mail/mailer.ts`, `src/server/mail/templates.ts`, `src/server/org/test-email.ts`
- Test: `tests/server/mail.test.ts`

**Interfaces:**
- Consumes: `Env`, `isSmtpConfigured` (Task 2); `OrganizationSettings` (Task 4).
- Produces:
  - `type MailMessage = { to: string; subject: string; text: string; html?: string; fromName?: string; replyTo?: string }`
  - `interface Mailer { readonly configured: boolean; send(message: MailMessage): Promise<{ messageId: string }> }`
  - `type MailTransport = { sendMail(options: SendMailOptions): Promise<{ messageId: string }> }`
  - `type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; fromEmail: string }`
  - `class MailerNotConfiguredError extends Error`, `class MailSendError extends Error`
  - `createSmtpMailer(config: SmtpConfig, transport?: MailTransport): Mailer`
  - `createMailerFromEnv(env: Env): Mailer`
  - `type EmailContent = { subject: string; text: string; html: string }`
  - `escapeHtml(value: string): string`, `verificationEmail(url: string): EmailContent`, `resetPasswordEmail(url: string): EmailContent`, `invitationEmail(input: { organizationName: string; inviterName: string; url: string }): EmailContent`, `testEmail(organizationName: string): EmailContent`
  - `sendTestEmail(mailer: Mailer, org: Pick<OrganizationSettings, "name" | "senderName" | "replyToEmail">, to: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing tests `tests/server/mail.test.ts`**

```ts
import type { SendMailOptions } from "nodemailer";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import {
  createMailerFromEnv,
  createSmtpMailer,
  MailerNotConfiguredError,
  MailSendError,
  type MailTransport,
} from "@/server/mail/mailer";
import { escapeHtml, invitationEmail } from "@/server/mail/templates";
import { sendTestEmail } from "@/server/org/test-email";

const config = { host: "smtp.example.com", port: 587, secure: false, fromEmail: "noreply@example.com" };

function capturingTransport() {
  const sent: SendMailOptions[] = [];
  const transport: MailTransport = {
    async sendMail(options) {
      sent.push(options);
      return { messageId: "<test@example.com>" };
    },
  };
  return { sent, transport };
}

describe("SMTP mailer", () => {
  it("sends with the organization sender name and reply-to", async () => {
    const { sent, transport } = capturingTransport();
    const mailer = createSmtpMailer(config, transport);
    const result = await mailer.send({
      to: "client@example.com",
      subject: "Hello",
      text: "Body",
      fromName: "Acme Proposals",
      replyTo: "sales@acme.com",
    });
    expect(result.messageId).toBe("<test@example.com>");
    expect(sent[0].from).toEqual({ name: "Acme Proposals", address: "noreply@example.com" });
    expect(sent[0].replyTo).toBe("sales@acme.com");
    expect(sent[0].to).toBe("client@example.com");
  });

  it("falls back to the product name when no sender name is given", async () => {
    const { sent, transport } = capturingTransport();
    await createSmtpMailer(config, transport).send({ to: "a@b.com", subject: "s", text: "t" });
    expect(sent[0].from).toEqual({ name: "PactPlum", address: "noreply@example.com" });
  });

  it("wraps transport failures in a readable MailSendError", async () => {
    const failing: MailTransport = {
      async sendMail() {
        throw new Error("Invalid login: 535 Authentication failed");
      },
    };
    const mailer = createSmtpMailer(config, failing);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(MailSendError);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(/Authentication failed/);
  });
});

describe("createMailerFromEnv", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
  };

  it("returns an unconfigured mailer when SMTP is missing", async () => {
    const mailer = createMailerFromEnv(parseEnv(base));
    expect(mailer.configured).toBe(false);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(MailerNotConfiguredError);
  });

  it("returns a configured mailer when host and from address are set", () => {
    const mailer = createMailerFromEnv(
      parseEnv({ ...base, SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "noreply@example.com" }),
    );
    expect(mailer.configured).toBe(true);
  });
});

describe("templates", () => {
  it("escapes HTML in names", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
    const email = invitationEmail({ organizationName: "<Acme>", inviterName: "Ann", url: "https://x.test/i" });
    expect(email.html).toContain("&lt;Acme&gt;");
    expect(email.text).toContain("https://x.test/i");
  });
});

describe("sendTestEmail", () => {
  const org = { name: "Acme", senderName: null, replyToEmail: null };

  it("reports a readable error when SMTP is not configured", async () => {
    const mailer = createMailerFromEnv(
      parseEnv({
        DATABASE_URL: "postgres://u:p@localhost/db",
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    );
    const result = await sendTestEmail(mailer, org, "owner@acme.com");
    expect(result).toEqual({
      ok: false,
      error: "Email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL, then restart PactPlum.",
    });
  });

  it("reports the SMTP error message on failure", async () => {
    const failing: MailTransport = {
      async sendMail() {
        throw new Error("Connection timeout");
      },
    };
    const result = await sendTestEmail(createSmtpMailer(config, failing), org, "owner@acme.com");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Connection timeout/);
  });

  it("succeeds with a working transport", async () => {
    const { sent, transport } = capturingTransport();
    const result = await sendTestEmail(createSmtpMailer(config, transport), org, "owner@acme.com");
    expect(result).toEqual({ ok: true });
    expect(sent[0].subject).toContain("Acme");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/server/mail.test.ts`
Expected: FAIL, cannot resolve `@/server/mail/mailer`.

- [ ] **Step 3: Implement `src/server/mail/mailer.ts`**

```ts
import nodemailer, { type SendMailOptions } from "nodemailer";
import { APP_NAME } from "@/lib/app-info";
import { isSmtpConfigured, type Env } from "@/lib/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
};

export interface Mailer {
  readonly configured: boolean;
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export type MailTransport = {
  sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
};

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL, then restart PactPlum.");
    this.name = "MailerNotConfiguredError";
  }
}

export class MailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailSendError";
  }
}

export function createSmtpMailer(config: SmtpConfig, transport?: MailTransport): Mailer {
  const activeTransport: MailTransport =
    transport ??
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    });

  return {
    configured: true,
    async send(message) {
      try {
        const info = await activeTransport.sendMail({
          from: { name: message.fromName ?? APP_NAME, address: config.fromEmail },
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return { messageId: info.messageId };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new MailSendError(`Could not send email: ${reason}`, { cause: error });
      }
    },
  };
}

const unconfiguredMailer: Mailer = {
  configured: false,
  async send() {
    throw new MailerNotConfiguredError();
  },
};

export function createMailerFromEnv(env: Env): Mailer {
  if (!isSmtpConfigured(env)) return unconfiguredMailer;
  return createSmtpMailer({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    fromEmail: env.SMTP_FROM_EMAIL!,
  });
}
```

- [ ] **Step 4: Implement `src/server/mail/templates.ts`**

```ts
import { APP_NAME } from "@/lib/app-info";

export type EmailContent = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(heading: string, body: string, url?: string, cta?: string): string {
  const button = url
    ? `<p><a href="${escapeHtml(url)}" style="background:#6b2d5c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(cta ?? "Open")}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px">
<h2>${escapeHtml(heading)}</h2>
<p>${body}</p>
${button}
<p style="color:#666;font-size:12px">Sent by ${APP_NAME}</p>
</div>`;
}

export function verificationEmail(url: string): EmailContent {
  return {
    subject: `Verify your ${APP_NAME} email address`,
    text: `Confirm your email address by opening this link:\n${url}\n\nIf you did not sign up, ignore this email.`,
    html: layout("Verify your email", "Confirm your email address to finish signing up.", url, "Verify email"),
  };
}

export function resetPasswordEmail(url: string): EmailContent {
  return {
    subject: `Reset your ${APP_NAME} password`,
    text: `Reset your password by opening this link:\n${url}\n\nIf you did not ask for this, ignore this email.`,
    html: layout("Reset your password", "Use the button below to choose a new password.", url, "Reset password"),
  };
}

export function invitationEmail(input: { organizationName: string; inviterName: string; url: string }): EmailContent {
  const org = escapeHtml(input.organizationName);
  const inviter = escapeHtml(input.inviterName);
  return {
    subject: `${input.inviterName} invited you to ${input.organizationName} on ${APP_NAME}`,
    text: `${input.inviterName} invited you to join ${input.organizationName} on ${APP_NAME}.\nAccept the invitation:\n${input.url}\n\nThe link expires in 7 days.`,
    html: layout(
      `Join ${input.organizationName}`,
      `${inviter} invited you to join <strong>${org}</strong>. The link expires in 7 days.`,
      input.url,
      "Accept invitation",
    ),
  };
}

export function testEmail(organizationName: string): EmailContent {
  return {
    subject: `${APP_NAME} test email for ${organizationName}`,
    text: `Your email settings work. ${APP_NAME} can send email for ${organizationName}.`,
    html: layout("Email is working", `${APP_NAME} can send email for ${escapeHtml(organizationName)}.`),
  };
}
```

- [ ] **Step 5: Implement `src/server/org/test-email.ts`**

```ts
import type { Mailer } from "@/server/mail/mailer";
import { testEmail } from "@/server/mail/templates";
import type { OrganizationSettings } from "@/server/org/settings";

export async function sendTestEmail(
  mailer: Mailer,
  org: Pick<OrganizationSettings, "name" | "senderName" | "replyToEmail">,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await mailer.send({
      to,
      ...testEmail(org.name),
      fromName: org.senderName ?? org.name,
      replyTo: org.replyToEmail ?? undefined,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 6: Run and confirm pass**

Run: `npx vitest run tests/server/mail.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/server/mail src/server/org/test-email.ts tests/server/mail.test.ts
git commit -m "feat: add SMTP mailer, email templates and test email"
```

---

### Task 6: Sign-up policy and Better Auth configuration

**Files:**
- Create: `src/server/auth/signup-policy.ts`, `src/server/auth/signup-hooks.ts`, `src/server/auth/auth.ts`, `src/app/api/auth/[...all]/route.ts`
- Test: `tests/server/signup.test.ts`

**Interfaces:**
- Consumes: `Db`, tables, `ensureOrganization` (Task 3); invitations helpers, `Role` (Task 4); `getEnv`, `enabledSocialProviders`, `requiresEmailVerification` (Task 2); `createMailerFromEnv`, templates (Task 5).
- Produces:
  - `type SignUpDecision = { allowed: true; role: Role; invitationId?: string } | { allowed: false; reason: "missing_email" | "not_invited" }`
  - `decideSignUp(input: { email: string; hasOwner: boolean; invitation: { id: string } | null; allowedDomains: string[] }): SignUpDecision`
  - `SIGN_UP_MESSAGES: Record<"missing_email" | "not_invited", string>`, `SIGN_IN_REFUSED_MESSAGE: string`
  - `resolveSignUp(db: Db, email: string | null | undefined, now?: Date): Promise<SignUpDecision>`
  - `applyDecision(db: Db, organizationId: string, userId: string, decision: SignUpDecision, now?: Date): Promise<Role | null>`
  - `applySignUp(db: Db, userId: string, email: string, now?: Date): Promise<Role | null>`
  - `auth` (Better Auth instance) from `@/server/auth/auth`
  - Route `GET|POST /api/auth/*`

- [ ] **Step 1: Write the failing tests `tests/server/signup.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invitations, members, organizations } from "@/db/schema";
import type { Db } from "@/db/types";
import { applySignUp, resolveSignUp } from "@/server/auth/signup-hooks";
import { decideSignUp, SIGN_UP_MESSAGES } from "@/server/auth/signup-policy";
import { ensureOrganization } from "@/server/org/bootstrap";
import { createInvitation } from "@/server/org/invitations";
import { createTestDb, insertUser } from "../helpers/test-db";

describe("decideSignUp", () => {
  const base = { hasOwner: true, invitation: null, allowedDomains: [] as string[] };

  it("makes the first user the owner", () => {
    expect(decideSignUp({ ...base, email: "a@acme.com", hasOwner: false })).toEqual({ allowed: true, role: "owner" });
  });

  it("refuses a provider that returned no email", () => {
    expect(decideSignUp({ ...base, email: "" })).toEqual({ allowed: false, reason: "missing_email" });
    expect(SIGN_UP_MESSAGES.missing_email).toMatch(/did not share a verified email/);
  });

  it("admits an invited user as member", () => {
    expect(decideSignUp({ ...base, email: "jane@acme.com", invitation: { id: "inv1" } })).toEqual({
      allowed: true,
      role: "member",
      invitationId: "inv1",
    });
  });

  it("admits an allowed domain regardless of case", () => {
    expect(decideSignUp({ ...base, email: "Jane@ACME.com", allowedDomains: ["acme.com"] })).toEqual({
      allowed: true,
      role: "member",
    });
  });

  it("refuses everyone else as invite-only", () => {
    expect(decideSignUp({ ...base, email: "x@other.com", allowedDomains: ["acme.com"] })).toEqual({
      allowed: false,
      reason: "not_invited",
    });
    expect(SIGN_UP_MESSAGES.not_invited).toBe(
      "This PactPlum workspace is invite-only. Ask the owner for an invitation.",
    );
  });
});

describe("sign-up hooks", () => {
  let db: Db;
  let close: () => Promise<void>;
  const now = new Date("2026-10-13T12:00:00Z");

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  it("creates the organization and makes the first user owner", async () => {
    const userId = await insertUser(db, "owner@acme.com");
    expect(await applySignUp(db, userId, "owner@acme.com", now)).toBe("owner");
    expect(await db.select().from(organizations)).toHaveLength(1);
    const [membership] = await db.select().from(members);
    expect(membership.role).toBe("owner");
  });

  it("refuses an uninvited second user", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await applySignUp(db, ownerId, "owner@acme.com", now);
    expect(await resolveSignUp(db, "stranger@other.com", now)).toEqual({ allowed: false, reason: "not_invited" });
    const strangerId = await insertUser(db, "stranger@other.com");
    expect(await applySignUp(db, strangerId, "stranger@other.com", now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });

  it("admits an invited user signing up with different email casing and accepts the invitation", async () => {
    const ownerId = await insertUser(db, "owner@acme.com");
    await applySignUp(db, ownerId, "owner@acme.com", now);
    const organizationId = await ensureOrganization(db);
    await createInvitation(db, { organizationId, userId: ownerId, role: "owner" }, { email: "Jane@Acme.com" }, now);

    const janeId = await insertUser(db, "jane@acme.com");
    expect(await applySignUp(db, janeId, "JANE@acme.com", now)).toBe("member");
    const [invitation] = await db.select().from(invitations);
    expect(invitation.acceptedAt).toEqual(now);
  });

  it("returns null instead of throwing when the owner slot was taken concurrently", async () => {
    const organizationId = await ensureOrganization(db);
    const firstId = await insertUser(db, "first@acme.com");
    const secondId = await insertUser(db, "second@acme.com");
    // Simulate the race: the second request already decided "owner" before the first committed.
    await db.insert(members).values({ organizationId, userId: firstId, role: "owner" });
    const { applyDecision } = await import("@/server/auth/signup-hooks");
    expect(await applyDecision(db, organizationId, secondId, { allowed: true, role: "owner" }, now)).toBeNull();
    expect(await db.select().from(members)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/server/signup.test.ts`
Expected: FAIL, cannot resolve `@/server/auth/signup-hooks`.

- [ ] **Step 3: Implement `src/server/auth/signup-policy.ts`**

```ts
import type { Role } from "@/server/tenancy";

export type SignUpDecision =
  | { allowed: true; role: Role; invitationId?: string }
  | { allowed: false; reason: "missing_email" | "not_invited" };

export const SIGN_UP_MESSAGES = {
  missing_email: "Your sign-in provider did not share a verified email address. Use another sign-in method.",
  not_invited: "This PactPlum workspace is invite-only. Ask the owner for an invitation.",
} as const;

export const SIGN_IN_REFUSED_MESSAGE =
  "We couldn't sign you in. This PactPlum workspace is invite-only, and your sign-in provider must share a verified email address.";

export function decideSignUp(input: {
  email: string;
  hasOwner: boolean;
  invitation: { id: string } | null;
  allowedDomains: string[];
}): SignUpDecision {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { allowed: false, reason: "missing_email" };
  if (!input.hasOwner) return { allowed: true, role: "owner" };
  if (input.invitation) return { allowed: true, role: "member", invitationId: input.invitation.id };
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (input.allowedDomains.some((allowed) => allowed.toLowerCase() === domain)) {
    return { allowed: true, role: "member" };
  }
  return { allowed: false, reason: "not_invited" };
}
```

- [ ] **Step 4: Implement `src/server/auth/signup-hooks.ts`**

```ts
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
```

- [ ] **Step 5: Run and confirm pass**

Run: `npx vitest run tests/server/signup.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Implement `src/server/auth/auth.ts`**

```ts
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { enabledSocialProviders, getEnv, requiresEmailVerification } from "@/lib/env";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";
import { normalizeEmail } from "@/server/org/invitations";
import { applySignUp, resolveSignUp } from "./signup-hooks";
import { SIGN_UP_MESSAGES } from "./signup-policy";

const env = getEnv();
const mailer = createMailerFromEnv(env);

function sendInBackground(promise: Promise<unknown>) {
  // Not awaited, so response timing does not reveal whether an account exists.
  promise.catch((error) => console.error("[auth] email failed:", error));
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: requiresEmailVerification(env),
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...resetPasswordEmail(url) }));
    },
  },
  emailVerification: {
    sendOnSignUp: requiresEmailVerification(env),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(mailer.send({ to: user.email, ...verificationEmail(url) }));
    },
  },
  socialProviders: enabledSocialProviders(env),
  // Throttles sign-in, sign-up and reset attempts per IP.
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const decision = await resolveSignUp(db, user.email);
          if (!decision.allowed) {
            throw new APIError("FORBIDDEN", { message: SIGN_UP_MESSAGES[decision.reason] });
          }
          return { data: { ...user, email: normalizeEmail(user.email) } };
        },
        after: async (user) => {
          await applySignUp(db, user.id, user.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
```

- [ ] **Step 7: Create the route handler `src/app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 8: Verify types and the full suite**

Run: `npm run typecheck && npm test`
Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add src/server/auth src/app/api tests/server/signup.test.ts
git commit -m "feat: configure Better Auth with invite-only sign-up policy"
```

---

### Task 7: Sign-in pages, session guard and authenticated shell

**Files:**
- Create: `src/lib/auth-client.ts`, `src/server/auth/session.ts`
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/sign-up/sign-up-form.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/no-access/page.tsx`, `src/app/(auth)/social-buttons.tsx`, `src/app/sign-out-button.tsx`
- Create: `src/app/app/layout.tsx`, `src/app/app/page.tsx`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx` (title)

**Interfaces:**
- Consumes: `auth` (Task 6), `getOrgContext`, `OrgContext` (Task 4), `getOrganizationSettings` (Task 4), `findInvitationByToken` (Task 4), `enabledSocialProviders`, `requiresEmailVerification`, `SocialProviderId` (Task 2), `SIGN_IN_REFUSED_MESSAGE` (Task 6).
- Produces:
  - `authClient` from `@/lib/auth-client`
  - `requireMember(): Promise<{ ctx: OrgContext; user: { id: string; name: string; email: string } }>` from `@/server/auth/session`
  - Pages `/sign-in`, `/sign-up?invite=TOKEN`, `/forgot-password`, `/reset-password?token=TOKEN`, `/no-access`, `/app`

- [ ] **Step 1: Create `src/lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 2: Create `src/server/auth/session.ts`**

```ts
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
```

- [ ] **Step 3: Create the auth layout and shared components**

`src/app/(auth)/layout.tsx`:

```tsx
import { APP_NAME } from "@/lib/app-info";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="mb-6 text-center text-lg font-semibold text-[#6b2d5c]">{APP_NAME}</p>
        {children}
      </div>
    </main>
  );
}
```

`src/app/(auth)/social-buttons.tsx`:

```tsx
"use client";

import { authClient } from "@/lib/auth-client";
import type { SocialProviderId } from "@/lib/env";

const LABELS: Record<SocialProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
  linkedin: "LinkedIn",
  slack: "Slack",
};

export function SocialButtons({ providers }: { providers: SocialProviderId[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-center text-xs text-neutral-500">or continue with</p>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          onClick={() =>
            authClient.signIn.social({ provider, callbackURL: "/app", errorCallbackURL: "/sign-in?error=refused" })
          }
        >
          {LABELS[provider]}
        </button>
      ))}
    </div>
  );
}
```

`src/app/sign-out-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-neutral-600 hover:text-neutral-900"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 4: Create the sign-in page**

`src/app/(auth)/sign-in/page.tsx`:

```tsx
import Link from "next/link";
import { enabledSocialProviders, getEnv, type SocialProviderId } from "@/lib/env";
import { SIGN_IN_REFUSED_MESSAGE } from "@/server/auth/signup-policy";
import { SocialButtons } from "../social-buttons";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const providers = Object.keys(enabledSocialProviders(getEnv())) as SocialProviderId[];
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <SignInForm initialError={error ? SIGN_IN_REFUSED_MESSAGE : undefined} />
      <SocialButtons providers={providers} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        <Link href="/forgot-password" className="underline">Forgot password?</Link>
        {" · "}
        <Link href="/sign-up" className="underline">Create account</Link>
      </p>
    </>
  );
}
```

`src/app/(auth)/sign-in/sign-in-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="email" type="email" required autoComplete="email" placeholder="Email"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <input name="password" type="password" required autoComplete="current-password" placeholder="Password"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create the sign-up page**

`src/app/(auth)/sign-up/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db/client";
import { enabledSocialProviders, getEnv, requiresEmailVerification, type SocialProviderId } from "@/lib/env";
import { findInvitationByToken } from "@/server/org/invitations";
import { SocialButtons } from "../social-buttons";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const invitation = invite ? await findInvitationByToken(db, invite) : null;
  const env = getEnv();
  const providers = Object.keys(enabledSocialProviders(env)) as SocialProviderId[];
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Create your account</h1>
      {invite && !invitation && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          This invitation link is invalid or has expired. Ask the owner for a new one.
        </p>
      )}
      <SignUpForm invitedEmail={invitation?.email} verificationRequired={requiresEmailVerification(env)} />
      <SocialButtons providers={providers} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </>
  );
}
```

`src/app/(auth)/sign-up/sign-up-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignUpForm({ invitedEmail, verificationRequired }: { invitedEmail?: string; verificationRequired: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/app",
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-up failed.");
      return;
    }
    if (verificationRequired) {
      setCheckEmail(true);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  if (checkEmail) {
    return <p className="text-sm">Check your inbox for a verification link to finish signing up.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="name" required autoComplete="name" placeholder="Full name"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <input name="email" type="email" required autoComplete="email" placeholder="Email"
        defaultValue={invitedEmail} readOnly={Boolean(invitedEmail)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm read-only:bg-neutral-100" />
      <input name="password" type="password" required minLength={8} autoComplete="new-password"
        placeholder="Password (8+ characters)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Create the password reset pages**

`src/app/(auth)/forgot-password/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({ email: String(form.get("email")), redirectTo: "/reset-password" });
    // Same message whether or not the account exists.
    setSent(true);
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="text-sm">If an account exists for that email, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input name="email" type="email" required placeholder="Email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white">
            Send reset link
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/sign-in" className="underline">Back to sign in</Link></p>
    </>
  );
}
```

`src/app/(auth)/reset-password/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState(params.get("error") ? "This reset link is invalid or has expired." : "");
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const result = await authClient.resetPassword({ newPassword: String(form.get("password")), token });
    if (result.error) setError(result.error.message ?? "Could not reset the password.");
    else setDone(true);
  }

  if (done) return <p className="text-sm">Password updated. <Link href="/sign-in" className="underline">Sign in</Link></p>;
  if (!token || error) return <p role="alert" className="text-sm text-red-600">{error || "This reset link is invalid."}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="password" type="password" required minLength={8} placeholder="New password (8+ characters)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <button type="submit" className="w-full rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white">
        Save new password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 7: Create the no-access page, the app shell and the dashboard**

`src/app/(auth)/no-access/page.tsx`:

```tsx
import { SIGN_UP_MESSAGES } from "@/server/auth/signup-policy";
import { SignOutButton } from "../../sign-out-button";

export default function NoAccessPage() {
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">No access yet</h1>
      <p className="mb-4 text-sm text-neutral-700">{SIGN_UP_MESSAGES.not_invited}</p>
      <SignOutButton />
    </>
  );
}
```

`src/app/app/layout.tsx`:

```tsx
import Link from "next/link";
import { APP_NAME } from "@/lib/app-info";
import { requireMember } from "@/server/auth/session";
import { SignOutButton } from "../sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireMember();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-6 text-sm">
          <span className="font-semibold text-[#6b2d5c]">{APP_NAME}</span>
          <Link href="/app">Dashboard</Link>
          <Link href="/app/settings">Settings</Link>
        </nav>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
```

`src/app/app/page.tsx`:

```tsx
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
```

`src/app/page.tsx` (replace scaffold content):

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/app");
}
```

In `src/app/layout.tsx`, set the metadata:

```ts
export const metadata: Metadata = {
  title: "PactPlum",
  description: "Open-source proposals, quotes, contracts and invoices with e-signatures.",
};
```

- [ ] **Step 8: Verify the build**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all succeed.

- [ ] **Step 9: Manual verification with Mailpit**

With `docker compose up -d db mailpit`, `npm run db:migrate` done and `.env` pointing SMTP at Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_FROM_EMAIL=noreply@pactplum.local`):

1. `npm run dev`, open http://localhost:3000. Expected: redirected to `/sign-in`.
2. Create an account at `/sign-up`. Expected: "Check your inbox". Open http://localhost:8025, click the verification link. Expected: lands on `/app` showing "Owner".
3. Sign out. Create a second account with another email. Expected: error "This PactPlum workspace is invite-only. Ask the owner for an invitation."
4. Use "Forgot password?" for the owner. Expected: reset email in Mailpit; the link sets a new password.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat: add sign-in, sign-up, password reset and authenticated shell"
```

---

### Task 8: Organization settings page (settings, members, invitations, test email)

**Files:**
- Create: `src/app/app/settings/page.tsx`, `src/app/app/settings/actions.ts`, `src/app/app/settings/settings-forms.tsx`

**Interfaces:**
- Consumes: `requireMember` (Task 7); `getOrganizationSettings`, `updateOrganizationSettings`, `listMembers`, `createInvitation` (Task 4); `createMailerFromEnv`, `invitationEmail` (Task 5); `sendTestEmail` (Task 5); `ForbiddenError`, `ValidationError` (Task 4); `getEnv` (Task 2).
- Produces: `type ActionState = { ok: boolean; message: string } | null`; server actions `updateSettingsAction`, `inviteMemberAction`, `sendTestEmailAction`, each `(prev: ActionState, formData: FormData) => Promise<ActionState>`.

- [ ] **Step 1: Create `src/app/app/settings/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { requireMember } from "@/server/auth/session";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createMailerFromEnv } from "@/server/mail/mailer";
import { invitationEmail } from "@/server/mail/templates";
import { createInvitation } from "@/server/org/invitations";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/org/settings";
import { sendTestEmail } from "@/server/org/test-email";

export type ActionState = { ok: boolean; message: string } | null;

function toMessage(error: unknown): string {
  if (error instanceof ForbiddenError || error instanceof ValidationError) return error.message;
  console.error("[settings]", error);
  return "Something went wrong. Check the server logs.";
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx } = await requireMember();
  try {
    await updateOrganizationSettings(db, ctx, {
      name: formData.get("name"),
      senderName: formData.get("senderName"),
      replyToEmail: formData.get("replyToEmail"),
      allowedSignupDomains: String(formData.get("allowedSignupDomains") ?? "").split(","),
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, user } = await requireMember();
  try {
    const invitation = await createInvitation(db, ctx, { email: String(formData.get("email") ?? "") });
    const env = getEnv();
    const url = `${env.BETTER_AUTH_URL}/sign-up?invite=${invitation.token}`;
    const org = await getOrganizationSettings(db, ctx);
    try {
      await createMailerFromEnv(env).send({
        to: invitation.email,
        ...invitationEmail({ organizationName: org.name, inviterName: user.name, url }),
        fromName: org.senderName ?? org.name,
        replyTo: org.replyToEmail ?? undefined,
      });
    } catch (mailError) {
      const reason = mailError instanceof Error ? mailError.message : String(mailError);
      return { ok: false, message: `Invitation created, but the email failed (${reason}). Share this link: ${url}` };
    }
    return { ok: true, message: `Invitation sent to ${invitation.email}.` };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function sendTestEmailAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { ctx, user } = await requireMember();
  const org = await getOrganizationSettings(db, ctx);
  const result = await sendTestEmail(createMailerFromEnv(getEnv()), org, user.email);
  return result.ok
    ? { ok: true, message: `Test email sent to ${user.email}.` }
    : { ok: false, message: result.error };
}
```

- [ ] **Step 2: Create `src/app/app/settings/settings-forms.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { OrganizationSettings } from "@/server/org/settings";
import { inviteMemberAction, sendTestEmailAction, updateSettingsAction, type ActionState } from "./actions";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const button = "rounded-md bg-[#6b2d5c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"} break-all`}>
      {state.message}
    </p>
  );
}

export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">Organization name
        <input name="name" defaultValue={settings.name} required className={input} />
      </label>
      <label className="block text-sm">Email sender name
        <input name="senderName" defaultValue={settings.senderName ?? ""} placeholder={settings.name} className={input} />
      </label>
      <label className="block text-sm">Reply-to email
        <input name="replyToEmail" type="email" defaultValue={settings.replyToEmail ?? ""} className={input} />
      </label>
      <label className="block text-sm">Allowed sign-up domains (comma separated)
        <input name="allowedSignupDomains" defaultValue={settings.allowedSignupDomains.join(", ")}
          placeholder="example.com" className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Save settings"}</button>
      <Status state={state} />
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, null);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input name="email" type="email" required placeholder="teammate@example.com" className={`${input} max-w-xs`} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Sending…" : "Send invitation"}</button>
      <div className="w-full"><Status state={state} /></div>
    </form>
  );
}

export function TestEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmailAction, null);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className={button}>{pending ? "Sending…" : "Send test email"}</button>
      <Status state={state} />
    </form>
  );
}
```

- [ ] **Step 3: Create `src/app/app/settings/page.tsx`**

```tsx
import { db } from "@/db/client";
import { requireMember } from "@/server/auth/session";
import { listMembers } from "@/server/org/members";
import { getOrganizationSettings } from "@/server/org/settings";
import { InviteForm, SettingsForm, TestEmailForm } from "./settings-forms";

export default async function SettingsPage() {
  const { ctx } = await requireMember();
  const [settings, members] = await Promise.all([getOrganizationSettings(db, ctx), listMembers(db, ctx)]);
  const isOwner = ctx.role === "owner";

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
        {isOwner ? (
          <SettingsForm settings={settings} />
        ) : (
          <p className="text-sm text-neutral-600">Only the owner can change organization settings.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Members</h2>
        <ul className="mb-4 divide-y rounded-md border border-neutral-200 bg-white">
          {members.map((member) => (
            <li key={member.userId} className="flex justify-between px-4 py-2 text-sm">
              <span>{member.name} · {member.email}</span>
              <span className="text-neutral-500">{member.role === "owner" ? "Owner" : "Member"}</span>
            </li>
          ))}
        </ul>
        {isOwner && <InviteForm />}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Email</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Sends a test message to your own address using the SMTP settings from the environment.
        </p>
        <TestEmailForm />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all succeed.

- [ ] **Step 5: Manual verification**

1. As owner, open `/app/settings`, change the organization name and sender name, save. Expected: "Settings saved." and the dashboard shows the new name.
2. Click "Send test email". Expected: "Test email sent to …" and the message appears in Mailpit with the sender name.
3. Stop Mailpit (`docker compose stop mailpit`) and click again. Expected: a red message containing the SMTP error (for example "Could not send email: connect ECONNREFUSED"). Start Mailpit again.
4. Invite `Teammate@Example.com`. Expected: "Invitation sent to teammate@example.com." In a private window, open the link from Mailpit. Expected: sign-up form with the email prefilled and read-only; creating the account lands on `/app` as Member.
5. As the member, open `/app/settings`. Expected: no settings form or invite form.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/settings
git commit -m "feat: add organization settings, member invitations and test email"
```

---

### Task 9: Docker image, compose app service and README

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `compose.yaml` (add `app` service), `README.md` (full setup), `.github/workflows/ci.yml` (docker job)

**Interfaces:**
- Consumes: `scripts/migrate.mjs`, `drizzle/` (Task 3); all env variables (Task 2).
- Produces: `docker compose --profile app up` runs PactPlum with Postgres and Mailpit.

- [ ] **Step 1: Create `.dockerignore`**

```gitignore
node_modules
.next
.git
.env
.env.*
!.env.example
docs
tests
coverage
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder values so `next build` can load configuration. Real values are
# supplied at runtime; these never reach the final image.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=docker-build-placeholder-secret-0123456789 \
    BETTER_AUTH_URL=http://localhost:3000
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node_modules/.bin/next start -p 3000"]
```

- [ ] **Step 3: Add the `app` service to `compose.yaml`**

Add under `services:`:

```yaml
  app:
    build: .
    profiles: ["app"]
    env_file: .env
    environment:
      DATABASE_URL: postgres://pactplum:pactplum@db:5432/pactplum
      SMTP_HOST: mailpit
      SMTP_PORT: "1025"
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
```

- [ ] **Step 4: Build and run the container**

```bash
docker compose --profile app up --build -d
docker compose logs app --tail 20
```

Expected: logs show `Migrations applied.` then Next.js `Ready`. http://localhost:3000 redirects to `/sign-in`.

If `next start` fails to load `next.config.ts` without dev dependencies, rename it to `next.config.mjs` with the same content (minus type imports), update the `COPY` line, and rebuild.

- [ ] **Step 5: Add a Docker build job to `.github/workflows/ci.yml`**

Append under `jobs:`:

```yaml
  docker:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t pactplum:ci .
```

- [ ] **Step 6: Replace `README.md` with the full setup guide**

```markdown
# PactPlum

Open-source proposals, quotes, contracts and invoices with e-signatures and Stripe payments. Free to self-host under the MIT license.

> Status: early development. Not ready for production use.

## Run with Docker

1. Copy the environment file: `cp .env.example .env`.
2. Set `BETTER_AUTH_SECRET` to a random value of at least 32 characters (`openssl rand -base64 32`).
3. Set `BETTER_AUTH_URL` to the public URL of your install (for local use, `http://localhost:3000`).
4. Start everything: `docker compose --profile app up --build -d`.
5. Open the URL. The first account you create becomes the **owner**. Everyone else needs an invitation or an allowed email domain (Settings → Allowed sign-up domains).

Local development emails go to Mailpit at http://localhost:8025.

## Run for development

1. Install Node 24 and Docker.
2. `cp .env.example .env` and set `BETTER_AUTH_SECRET`.
3. `docker compose up -d db mailpit`
4. `npm install` and `npm run db:migrate`
5. `npm run dev`, then open http://localhost:3000.

Checks: `npm run lint`, `npm run typecheck`, `npm test`.

## Email (SMTP)

PactPlum sends email through any SMTP server. Without SMTP, sign-up still works but email verification, password reset and invitation emails are disabled.

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE | Notes |
|---|---|---|---|---|
| Google Workspace / Gmail | smtp.gmail.com | 465 | true | Use an app password for `SMTP_PASSWORD`. |
| Microsoft 365 | smtp.office365.com | 587 | false | SMTP AUTH must be enabled for the mailbox. |
| Brevo | smtp-relay.brevo.com | 587 | false | `SMTP_USER` is your Brevo SMTP login; `SMTP_PASSWORD` is an SMTP key. |

`SMTP_FROM_EMAIL` must be an address your provider allows you to send from. Use Settings → Send test email to check the configuration.

## Login providers

Email and password always works. Each provider below appears on the sign-in page only when both its client id and secret are set. Register an OAuth app with the provider and use this redirect URL:

`{BETTER_AUTH_URL}/api/auth/callback/{provider}`

| Provider | Variables | `{provider}` |
|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `google` |
| Microsoft (Entra ID) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (default `common`) | `microsoft` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `linkedin` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | `slack` |

LinkedIn may not share an email address. PactPlum refuses sign-in without one and asks the user to choose another method.

## Deploy on Vercel

1. Create a Postgres database (for example Neon or Supabase) and set `DATABASE_URL`.
2. Set the variables from `.env.example` in the Vercel project, with `BETTER_AUTH_URL` set to your production URL.
3. Run `npm run db:migrate` once against the production database before the first deploy and after each release that adds migrations.

## Legal

PactPlum records an audit trail designed around e-signature principles, but it is not legal advice. You are responsible for compliance in your jurisdiction.

## License

MIT. See [LICENSE](LICENSE).
```

- [ ] **Step 7: Final verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && docker build -t pactplum:local .`
Expected: all succeed.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml README.md .github/workflows/ci.yml
git commit -m "chore: add Docker image, compose app service and setup guide"
```
