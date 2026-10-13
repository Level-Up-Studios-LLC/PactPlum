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
