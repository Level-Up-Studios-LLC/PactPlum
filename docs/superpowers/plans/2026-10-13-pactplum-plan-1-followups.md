# PactPlum Plan 1 — Follow-ups

Items found during Plan 1 reviews and deliberately deferred. Later plans must account for them.

## Binding rules for Plan 2 onward

- Every page, server action and route handler under `/app` calls `requireMember()` itself. A layout check does not protect pages, actions or route handlers.
- Every tenant query takes an `OrgContext` and filters by `ctx.organizationId`.
- New sensitive code lives under paths matched by the maintainer's Greptile Plus rules (`**/auth/**`, `**/payments/**`, `**/billing/**`, `**/signing/**`, `**/audit/**`, `**/tenancy.ts`, `**/invitations.ts`, `drizzle/**`).

## Before Plan 3 (send and sign)

- Switch the Better Auth tables (`user`, `session`, `account`, `verification`) to `timestamp with time zone`, matching the organization tables.
- Database-backed rate limiter (the built-in limiter is in-memory per instance and weak on serverless); signing routes need it too.
- Security headers / CSP for the public signing page.
- Startup validation: call `getEnv()` at boot (for example in `src/instrumentation.ts`) so a bad env or `DEPLOYMENT_MODE=hosted` fails at startup instead of on the first request.

## Before first release (security hardening)

- Bind email/password sign-up for invited addresses to the invitation token, so an unverified account created by someone else cannot be activated when the real invitee clicks the verification email (pre-hijack). Clean up unverified accounts that squat invited addresses.
- README: recommend email sign-up for the first (owner) account; a social provider that reports an unverified email cannot complete owner verification.
- Sign-in page: map error codes (`email_not_verified`, `account_not_linked`, `NOT_INVITED`) to specific messages and tell unverified users that a new verification link was sent.
- Run the Docker image once (`docker compose --profile app up --build`) and add a CI step that starts the container, not only builds it.
- Dockerfile: `exec` in CMD for signal forwarding; `--chown=node:node` on the copied `.next`; fuller `.dockerignore`; optional HEALTHCHECK and pinned base image.
- Triage `npm audit` findings (currently dev tooling only).
- `package.json`: add `"license": "MIT"` and `engines.node >= 24`.

## Smaller items

- `invitations` has no `role` column (spec lists one); add it when inviting owners/other roles becomes a feature.
- Test gaps: cross-organization isolation for settings and invitations; expired invitation by email; DB-driven allowed domains; whitespace in domains.
- Settings: trim `replyToEmail` before validation; stronger domain validation with dedupe and length caps; owner-only test email (SMTP error text is currently visible to members); keep the invite input value after a failed submit.
- Forgot/reset password forms: pending states, error handling, `autoComplete="new-password"`, `role="status"` on success messages.
- Any future owner-removal or transfer feature must handle the empty-owner case: today the next signed-in user without membership would become owner.
- Replace the default favicon with a PactPlum icon during logo work.

## Moved from Plan 2 to Plan 3

- Image block in the editor, with S3-compatible storage (type and size limits from spec section 12). Plan 3 needs storage for signature images and PDFs anyway.
- `fields` table: created on send from the field nodes in the frozen revision.
- `settings` table: signature modes, default expiry (60 days), ESIGN consent text.
- Editing a sent or viewed document returns it to draft and invalidates its tokens (`edit` transition exists in `src/server/documents/lifecycle.ts`).
- Send must call `checkSendReadiness` and refuse while it reports problems, then resolve variables with `resolveVariables` into the revision.
- Content validation stores the raw editor JSON; Plan 3's rendering must allow only safe link URL schemes (http, https, mailto) or store the schema-normalized JSON.
- `listDocuments` should also scope its contacts join by organization, and `deleteDocument` should report when nothing was deleted.
