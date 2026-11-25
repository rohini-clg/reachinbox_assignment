# Implementation Changelog

## Current audit and hardening work

- Added an absolute backend `.env` loader shared by API, worker, database, Redis, and SMTP configuration so startup is independent of the shell's working directory; the missing-`DATABASE_URL` error now gives the exact copy/configure step.
- Removed the unused `npx` development dependency and applied compatible package updates. Updated Axios/NextAuth and kept Next.js plus `eslint-config-next` aligned at patched Next.js 16.4.6.
- Aligned Prisma CLI, Client, and PostgreSQL adapter at 7.10.1 after npm's compatible update had moved the CLI ahead of the previously installed client/adapter versions.
- Upgraded Nodemailer to 10.6.1 after confirming the app's `createTransport`/`sendMail` API use and Node 22 compatibility; removed redundant `@types/nodemailer` because the upgraded package bundles declarations.
- Added production SMTP host validation, implicit TLS for port 465, STARTTLS enforcement for submission ports, and certificate verification.
- Hardened production PostgreSQL TLS, Redis TLS/authentication, Elasticsearch HTTPS/API-key, and API-token length validation; hardened optional Compose service binding/authentication.
- Added focused regression tests for production service configuration. Backend build and 11 tests, frontend lint/build pass.
- Updated the complete npm advisory inventory and recorded one unresolved High Effect/Prisma CLI advisory in `SECURITY_AUDIT.md`; no force upgrade or unsupported override was applied.
- Added `E2E_TEST_REPORT.md` with verified checks and explicit provider/database blockers. No SMTP email was sent and no PostgreSQL database/schema was modified.
- Reviewed Cloudflare deployment separately; the existing Express/BullMQ worker is not deployable unchanged to ordinary Workers.

- Added a persistent Prisma schema for idempotency, in-progress delivery, per-sender throttling, and encrypted Slack integration storage.
- Added request validation for subject/body lengths, recipient format/count, future schedule time, delay, and hourly limit.
- Added per-recipient idempotency keys and deterministic BullMQ job IDs; added worker startup recovery for database rows still pending in Redis.
- Added a Redis Lua send-slot and sender/hour counter so concurrency, minimum spacing, and limit deferral are coordinated across worker instances.
- Split API and worker entry points: `npm run dev` / `npm start` run the API; `npm run dev:worker` / `npm run start:worker` run the persistent worker.
- Added database/Redis readiness checks, exact-origin CORS, a protected internal API token, and graceful shutdown handlers.
- Removed hard-coded SMTP credentials. SMTP now requires configured environment credentials.
- Replaced the fake dashboard login with Google OAuth, a protected dashboard, logout, and a session-checked Next.js API proxy.
- Added sender-scoped email API reads and input/response error handling in dashboard routes.
- Added optional Elasticsearch indexing/search and a sender-scoped search endpoint.
- Added an authenticated live BullMQ queue view in the dashboard.
- Added Slack OAuth state handling, encrypted token/webhook persistence, connect/disconnect controls, and once-per-hour notifications.
- Added focused schedule validation tests and database setup/deployment documentation.

## Not completed or not verified

- No DB schema push/migration was run; the host contains multiple PostgreSQL versions and no backend `.env` was present.
- No SMTP, Google OAuth, Slack OAuth, or Elasticsearch credentials were configured or tested.
- Elasticsearch indexing is best-effort and lacks a persistent repair/retry queue.
- Exactly-once email delivery is impossible to guarantee across the SMTP acceptance/database commit boundary. Ambiguous interrupted sends are marked failed to avoid automatic duplicates.
- Cloud infrastructure was documented only; no deployment or paid resource was created.
- Figma parity and production load/security testing remain unverified.

## Worktree and database safety

The previously modified frontend lockfile was updated in scope for the dependency audit; no unrelated user changes were intentionally reverted. No existing PostgreSQL service or database was changed.
