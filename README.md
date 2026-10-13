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

Without SMTP, people who sign up with email and password cannot verify their address, so they can only join as members by signing in with a provider that verifies email (for example Google or a Microsoft work account). The first account (the owner) can always sign up.

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE | Notes |
|---|---|---|---|---|
| Google Workspace / Gmail | smtp.gmail.com | 465 | true | Use an app password for `SMTP_PASSWORD`. |
| Microsoft 365 | smtp.office365.com | 587 | false | SMTP AUTH must be enabled for the mailbox. |
| Brevo | smtp-relay.brevo.com | 587 | false | `SMTP_USER` is your Brevo SMTP login; `SMTP_PASSWORD` is an SMTP key. |

`SMTP_FROM_EMAIL` must be an address your provider allows you to send from. Use Settings → Send test email to check the configuration.

## Login providers

Email and password always works. Each provider below appears on the sign-in page only when both its client id and secret are set. Register an OAuth app with the provider and use this redirect URL:

`{BETTER_AUTH_URL}/api/auth/callback/{provider}`

Members join only with a verified email address. Clients who view, sign or pay never need an account.

| Provider | Variables | `{provider}` |
|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `google` |
| Microsoft (Entra ID) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (default `common`) | `microsoft` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `linkedin` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | `slack` |

LinkedIn may not share an email address. PactPlum refuses sign-in without one and asks the user to choose another method.

## Running behind a proxy

Login rate limiting uses the client IP. If PactPlum runs behind a reverse proxy or load balancer, make sure the proxy sets `X-Forwarded-For` and does not pass through client-supplied values, otherwise all users may share one rate-limit bucket.

## Deploy on Vercel

1. Create a Postgres database (for example Neon or Supabase) and set `DATABASE_URL`.
2. Set the variables from `.env.example` in the Vercel project, with `BETTER_AUTH_URL` set to your production URL.
3. Run `npm run db:migrate` once against the production database before the first deploy and after each release that adds migrations.

## Legal

PactPlum records an audit trail designed around e-signature principles, but it is not legal advice. You are responsible for compliance in your jurisdiction.

## License

MIT. See [LICENSE](LICENSE).
