# Changelog

All notable changes to PactPlum are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and PactPlum uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until 1.0.0, a minor version can include breaking changes.

## [Unreleased]

## [0.2.0] - 2026-10-13

### Added

- Contacts: add, search, edit and delete clients. Email addresses are unique within an organization.
- Product catalog: prices stored in minor units for any ISO 4217 currency, including zero- and three-decimal currencies, with optional SKUs and a billing type.
- Templates with a block editor: headings, text, lists, tables, page breaks, a pricing-table block, signature, date, text and checkbox fields assigned to roles, and `[Group.Name]` variables.
- Pricing tables: sections, a catalog picker, custom columns with safe formulas, optional lines, choose-one sections, line and quote discounts, quote tax and live totals. The server recomputes every total.
- Documents (proposal, quote, contract, invoice) created from a template for a client, numbered per type (`P-0001`, `Q-0001`, `C-0001`, `INV-0001`), with recipients in signing order, custom variable values, payment settings and a send-readiness checklist. The documents list pages and searches by name or number.
- Saving a document or template that someone else changed since you opened it is refused with a message to reload, instead of overwriting their work.
- Navigation for Documents, Templates, Contacts and Catalog.

## [0.1.0] - 2026-10-13

### Added

- Next.js app on PostgreSQL with Drizzle migrations.
- One organization per install, with every query scoped to the organization.
- Invite-only sign-up with email and password, plus Google, Microsoft, LinkedIn and Slack sign-in.
- Email verification: invited people join only after verifying their address. With SMTP configured, the first account to verify becomes the owner.
- Invitations: one pending invitation per address, re-invites replace the earlier one, and each invitation can be accepted once.
- Optional allowed sign-up domains.
- Password reset, which ends all other sessions.
- SMTP email through any provider, with a sender name and reply-to address per organization.
- Settings page: organization details, members, invitations and a test email. Members see settings read-only.
- Built-in rate limiting for auth routes, with optional proxy settings (`AUTH_IP_ADDRESS_HEADERS`, `AUTH_TRUSTED_PROXIES`).
- Dockerfile and `compose.yaml` with PostgreSQL and Mailpit for local email.
- GitHub Actions CI: lint, type check, tests, build and Docker image build.
- MIT license, contributing guide and security policy.

[Unreleased]: https://github.com/Level-Up-Studios-LLC/PactPlum/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Level-Up-Studios-LLC/PactPlum/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Level-Up-Studios-LLC/PactPlum/releases/tag/v0.1.0
