# PactPlum — Design Spec (Phase 1: Core)

Date: 2026-10-13
Status: Draft for maintainer review
License: MIT (open source, free to use)
Name: PactPlum (domain `pactplum.com`, GitHub org `pactplum`, npm scope `@pactplum`)

## 1. Product overview

PactPlum is an open-source web app for creating, sending, e-signing and getting paid for client proposals, quotes, contracts and invoices. Core loop: build a document from a template, fill variables and a pricing table, send a tokenized link, the client e-signs and pays, and the team receives a signed PDF with an audit certificate.

One codebase runs in two modes, selected by `DEPLOYMENT_MODE`:
- `self-hosted`: one organization per installation. The deployer supplies every key (database, storage, SMTP, OAuth apps, Stripe, optional AI).
- `hosted`: a free multi-tenant service run by the maintainer on Vercel. The maintainer supplies the platform keys (Brevo, OAuth apps, AI). Each organization connects its own Stripe account.

### Roadmap

- **Phase 1 — Core (this spec).** Everything needed to run self-hosted. The data model and code are multi-tenant-ready so Phase 2 adds no schema rewrite.
- **Phase 2 — Hosted mode.** Public sign-up creating organizations, strict organization isolation, Brevo platform email with optional verified business domains per organization, Stripe Connect for each organization's payments, per-organization sending limits and suspension, terms of service and privacy policy pages.
- **Phase 3 — AI.** AI features through a provider layer supporting Claude and OpenAI. Hosted: maintainer keys, metered against AI credits sold as monthly or yearly Stripe Billing subscriptions, cancellable any time through the Stripe Customer Portal. Self-hosted: enabled only when the deployer adds their own AI keys; no billing.
- **Later.** SSO (SAML 2.0 and OIDC), PayPal as a second payment provider.

Phases 2 and 3 each get their own spec and plan.

## 2. Phase 1 scope

Success criteria:
- A deployer can run the app with Docker Compose or on Vercel using only documented environment variables.
- A member can create a template, generate a document from it for a contact, and send it by email.
- A client can open the link without an account, review, toggle optional line items, sign (draw, type or upload), and pay through Stripe.
- Invoice documents are issued as Stripe Invoices and marked paid from Stripe events.
- Members see status changes (`sent`, `viewed`, `completed`, `waiting_pay`, `paid`, `declined`, `voided`) and receive the completed PDF with a certificate page.
- Every state change is recorded in an append-only audit log.

Out of scope for Phase 1: hosted mode (Phase 2), AI (Phase 3), SSO, PayPal, approvals workflows, SMS delivery, CRM links, realtime collaborative editing, outbound webhooks for third parties, Stripe subscriptions and installments, notary and QES/AES signatures, conditional smart content.

## 3. Open-source requirements

- MIT `LICENSE`, `README` with setup for Docker and Vercel, `CONTRIBUTING`, `SECURITY` (how to report vulnerabilities), `.env.example` listing every variable.
- No vendor lock-in: any Postgres, any S3-compatible object storage, any SMTP server, optional login providers.
- Each login provider is enabled only when its environment variables are present.
- No third-party branding. The project uses its own name and assets.
- No telemetry by default.

## 4. Architecture

- Next.js (App Router) in TypeScript.
- Postgres via Drizzle ORM. Works with any Postgres (local, Docker, Neon, Supabase, RDS).
- S3-compatible object storage for images, signature images and finished PDFs (AWS S3, Cloudflare R2, MinIO).
- Email through SMTP with Nodemailer. Any provider works (Google Workspace, Microsoft 365, Brevo, others), configured by environment variables in self-hosted mode.
- Authentication with Better Auth (section 6).
- Payments behind a `PaymentProvider` interface. Phase 1 ships the Stripe implementation (Checkout and Invoicing). PayPal is a later implementation of the same interface.
- PDF output: the frozen revision HTML is rendered through headless Chromium and a certificate page is appended. The Docker image bundles Chromium. On Vercel, a serverless Chromium build is used; its size and runtime limits must be verified before release.
- Deployment targets: Docker Compose (app, Postgres, MinIO) and Vercel.

Route groups:
- `/app/*` member area, authenticated.
- `/s/[token]` public signing page, one unguessable token per recipient.
- `/api/auth/*` Better Auth.
- `/api/payments/stripe/webhook` Stripe events.
- `/api/cron/expire` expiry job, protected by a shared secret. Triggered by Vercel Cron or a container scheduler.

Units and boundaries:
- `documents`: lifecycle state machine, revisions, totals. No UI or provider code.
- `quote`: pure functions over a quote schema that return totals in integer minor units.
- `signing`: token issue and verification, field completion, completion detection.
- `audit`: append events and verify the hash chain.
- `pdf`: render revision and certificate to a PDF buffer.
- `payments`: `PaymentProvider` interface, Stripe implementation, webhook handling.
- `mail`: `Mailer` interface with an SMTP implementation. Phase 2 adds a Brevo implementation.
- `storage`: S3-compatible adapter with put, get and signed-URL functions.
- `tenancy`: resolves the current organization for every request. In self-hosted mode it always returns the single organization.

## 5. Data model

Every tenant-owned table carries `organization_id`, and every query goes through the `tenancy` scope. Self-hosted mode has exactly one organization row.

- `organizations`: name, logo, address, default currency, email sender name, reply-to address, branding.
- `users`, `sessions`, `accounts`, `verifications`: managed by Better Auth.
- `members`: organization id, user id, role (`owner | member`).
- `invitations`: organization id, email, role, token hash, expiry.
- `contacts`: name, email, company, phone, address, `stripe_customer_id`.
- `products`: title, SKU, description, price (minor units), currency, billing type.
- `templates`: name, block tree, roles, quote schema, settings.
- `documents`: `type` (`proposal | quote | contract | invoice`), name, `status`, created by, current revision id, `number` (from a numbering sequence), currency, total, `date_created`, `date_sent`, `date_completed`, `date_declined`, `date_expiration`, payment settings (`mode: off | deposit_percent | full`, `percent`).
- `revisions`: document id, frozen content snapshot, frozen quote, variable values, created at. A new revision is created on every send.
- `recipients`: document id, contact id, role, kind (`signer | cc`), ordering, token hash, token expiry, `signer_state`.
- `fields`: document id, recipient id, type (`signature | date | text | checkbox`), position, required, value.
- `quotes`: sections containing line items. Columns are typed fields with optional formulas. Tax and discount are percent or absolute. Rows can be optional or in a multichoice section.
- `payments`: document id, provider (`stripe`), kind (`checkout | invoice`), provider object id, amount, currency, status, hosted URL.
- `events`: document id, type, actor, IP, user agent, timestamp, previous hash, hash. Append-only.
- `numbering_sequences`: prefix, next value, per document type.
- `settings`: allowed signature modes, default expiry (60 days), ESIGN consent text, enabled payment modes.

Statuses: `draft, sent, viewed, completed, declined, voided` (UI label "Expired"). Payment adds `waiting_pay` and `paid`.

Rules:
- Money is stored as integer minor units plus a currency. Formatting rules are separate.
- Editing a `sent` document returns it to `draft` and invalidates its tokens. Earlier view events stay in the audit log but are tied to the previous revision and are not shown as current activity.
- `viewed` is set only when someone who is not a member of the organization opens a signing link.

## 6. Authentication

Better Auth with:
- `emailAndPassword` with email verification and password reset sent through the mailer.
- Social providers: `google`, `microsoft` (Microsoft Entra ID, configurable tenant), `linkedin`, `slack`.
- Each provider is shown on the login page only when its client id and secret are configured. In self-hosted mode the deployer registers their own OAuth apps; in hosted mode the maintainer's apps are used.
- Sign-up policy (self-hosted): the first account becomes `owner`. Later sign-ups require an invitation or an allowed email domain set by the owner.
- LinkedIn may not return an email address. Sign-in without a verified email is rejected with a clear message.
- SSO is deferred to a later phase.

Login applies only to the member area. Clients never need an account to view, sign or pay.

## 7. Email

- `Mailer` interface with one `send` function. Phase 1 implements SMTP through Nodemailer.
- Self-hosted: SMTP host, port, security, user and password from environment variables. The README documents settings for Google Workspace, Microsoft 365 and Brevo.
- Messages use the organization's sender name and reply-to address, so client replies reach the team.
- A "send test email" action in settings confirms the configuration.
- Failed sends are recorded as document events and shown to members.

## 8. Editor and quote builder

- Block tree on a ProseMirror/TipTap editor. Blocks: heading, text, image, table, page break, quote (pricing), signature field, date field, text field, checkbox.
- Variables use the `[Client.Name]` form and are filled from the contact when a document is created from a template. Sending is blocked while any variable is unresolved or any field has no recipient.
- Quote block: sections and line items, a catalog picker, typed columns with optional formulas, tax and discount (percent or absolute), optional rows and multichoice sections, per-quote currency.
- Totals are computed on the server. Client input never sets an amount.

## 9. Send and sign flow

1. Draft to sent: validate, create a revision, issue one token per recipient (stored hashed), set `date_expiration`, email the link, record events.
2. Signing page `/s/[token]`: shows a "N fields required" bar, a disabled Finish button until required fields are filled, a guide to the next field, optional-row toggles, and a table-of-contents toggle.
3. Signature dialog: Draw, Type (styled name) and Upload tabs, an ESIGN consent line with links, and "Accept and sign". Only modes enabled in settings are shown.
4. First view by a non-member sets `viewed` and notifies the document creator.
5. Completion: when the last signer finishes, status becomes `completed`, the PDF is rendered and emailed to the creator. If payment is enabled, the client continues to payment (section 10).
6. Decline and expiry: a client can decline. The expiry job marks overdue documents `voided`.

## 10. Payments (Stripe)

Phase 1 uses the deployer's own Stripe account, configured by environment variables. Phase 2 replaces this with Stripe Connect per organization in hosted mode.

Proposals, quotes and contracts (Stripe Checkout):
- Payment setting per document: off, deposit percent, or full total.
- After signing, the client sees a Pay step. The server creates a Checkout Session in payment mode with an amount computed from the final selected quote.
- Status moves `completed → waiting_pay → paid` only after a verified `checkout.session.completed` event.

Invoices (Stripe Invoicing):
- An invoice document creates or reuses the contact's Stripe Customer, adds one invoice item per quote line (quantity, unit amount, tax and discounts mapped to Stripe), then finalizes and sends the Stripe Invoice.
- The client receives Stripe's hosted invoice page link in the app's email and on the document page. Signature is optional for invoices.
- Status moves `sent → waiting_pay → paid` on `invoice.finalized` and `invoice.paid`. `invoice.payment_failed` and `invoice.voided` are recorded as events; a voided Stripe invoice marks the document `voided`.
- The app's document number is stored in the Stripe invoice metadata and description.

Shared rules:
- Webhooks verify the Stripe signature and are idempotent by event id.
- Secret keys live only in server environment variables. Restricted keys are recommended in the README.

## 11. PDF and audit certificate

- The completion PDF is the frozen revision rendered through headless Chromium, with a final Signature Certificate page.
- The certificate lists the document reference, signers, signature images, verified emails, IPs and locations, sent, viewed and completed timestamps, and a hash of the document.
- The certificate is built from the hash-chained `events` log. Verification recomputes the chain.
- This is an audit trail designed around ESIGN and UETA principles (intent, consent, association of signature with record, retention). The README states that it is not legal advice and deployers are responsible for compliance in their jurisdiction.

## 12. Security and error handling

- Signing tokens are random, stored as hashes, expire, and are invalidated when a sent document is edited.
- Rate-limit the login, signing and payment routes. Signing routes expose only the data for that recipient's document.
- All member-area server actions check the session, organization membership and role.
- Every tenant-owned query is scoped by `organization_id` through the `tenancy` unit, even in self-hosted mode, so Phase 2 isolation is enforced by the same code path.
- Stripe webhooks verify signatures. The cron route requires a shared secret.
- Failed PDF renders are recorded as events and shown to members. A document is not marked `completed` until the PDF exists or the failure is recorded.
- Uploaded images are type- and size-limited.

## 13. Testing

- Unit tests for the quote engine (totals, tax, discounts, optional and multichoice rows, rounding in minor units) and the lifecycle state machine.
- Unit tests for the audit hash chain, including tamper detection.
- Integration tests for the signing flow (token validity, expiry, required fields, completion detection).
- Stripe webhook tests with signed fixtures for both Checkout and Invoicing, covering idempotency.
- Auth tests for the sign-up policy (first user owner, invitation required afterwards).
- Tenancy tests proving a query cannot return another organization's rows.
- A smoke test that renders a PDF with certificate from a fixture revision.
- CI on GitHub Actions: lint, type-check, tests, Docker build.

## 14. Design basis

Feature design was informed by common practice in commercial document and e-signature tools and their public documentation. Research notes are kept privately and are not part of this repository.

## 15. Open decisions

- Logo and brand palette (plum-based).
- Trademark search for "PactPlum" (USPTO classes 9 and 42) before branding work.
- Vercel serverless Chromium: confirm it fits size and duration limits, or render PDFs in a separate container.
- Stripe Tax: whether to use Stripe's automatic tax for invoices or keep tax from the quote.
- Phase 3 AI feature list.
