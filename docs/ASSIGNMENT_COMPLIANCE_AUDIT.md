# Assignment Compliance Audit

## Scope and evidence

The original assignment was supplied in the conversation. The repository has no separate assignment source file, so this matrix compares the implementation with that supplied document. Code status is based on static inspection and the checks listed in `FINAL_TEST_REPORT.md`; external-provider workflows and the PostgreSQL schema update have not been run with credentials.

| Requirement | Status | Evidence and remaining work |
|---|---|---|
| TypeScript + Express API | PARTIALLY DONE | `backend/src/index.ts` is an Express TypeScript API with liveness/readiness routes. It compiles, but this machine has no `backend/.env`, so full readiness and database endpoints cannot pass. |
| Relational persistence with PostgreSQL | PARTIALLY DONE | Prisma 7/PostgreSQL models are in `backend/prisma/schema.prisma`; `backend/src/config/db.ts` now requires `DATABASE_URL`. New `PROCESSING`, idempotency, sender throttling, and Slack integration fields require a deliberate schema push on the verified project database. |
| Schedule at a requested time using BullMQ delayed jobs; no cron | PARTIALLY DONE | `backend/src/controllers/emailController.ts` uses BullMQ delayed jobs and deterministic job IDs. Request validation is covered by unit tests. End-to-end scheduling needs the database and Redis schema/configuration. No cron dependency is used. |
| Recover after restarts | PARTIALLY DONE | Redis retains delayed BullMQ jobs; `backend/src/workers/emailWorker.ts` also reconstructs queue jobs from pending database records on worker startup. The inspected Memurai service has RDB snapshots and a successful last-save status, but AOF is disabled and no restart/durability test was performed. A job interrupted during SMTP delivery is marked failed rather than blindly resent; SMTP cannot provide true exactly-once delivery. |
| Prevent duplicate scheduling/delivery | PARTIALLY DONE | Per-recipient idempotency keys are stored in PostgreSQL and BullMQ jobs use the email row ID. Worker status claims prevent concurrent sends. SMTP acceptance followed by a network/database failure is inherently ambiguous and cannot be made exactly-once; that case is surfaced as failed to avoid an automatic duplicate. |
| Ethereal SMTP delivery | PARTIALLY DONE | `backend/src/services/mailService.ts` requires SMTP credentials, an explicit production host, and encrypted SMTP (STARTTLS or implicit TLS). Actual sending remains unverified until valid Ethereal credentials are entered locally. |
| Multiple senders | PARTIALLY DONE | Authenticated Google account email is the sender identity and each sender has its own persistent rate/delay settings. Sending as additional provider-approved addresses is not implemented. |
| Configurable worker concurrency | DONE (code) | `WORKER_CONCURRENCY` is read by `backend/src/workers/emailWorker.ts`; worker runs separately via `npm run dev:worker` / `npm run start:worker`. Runtime concurrency was not integration-tested. |
| Minimum delay between sends | DONE (code) | A Redis Lua reservation assigns send slots per sender across worker instances. Effective delay is at least `DELAY_BETWEEN_EMAILS_MS`; request-level values may raise the sender delay. |
| Hourly rate limiting; defer instead of dropping | DONE (code) | Redis Lua counters are sender/hour scoped. Reached limits move jobs to the next UTC hour using BullMQ delayed-job APIs; they are not failed for rate limiting. API input cannot raise the configured `MAX_EMAILS_PER_HOUR` ceiling. |
| Rate-limit Slack notification, real OAuth, persistence, reconnect/disconnect | PARTIALLY DONE | `backend/src/controllers/slackController.ts` implements one-use OAuth state in Redis; `backend/src/services/slackService.ts` encrypts stored bot/webhook credentials and sends a webhook message once per sender/hour. Dashboard exposes connect/disconnect. Live OAuth/notification verification requires a Slack app, redirect URL, and encryption key. |
| Elasticsearch email indexing/search | PARTIALLY DONE | `backend/src/services/emailSearchService.ts` indexes email state and scopes searches by authenticated sender. The dashboard search uses that endpoint. `ELASTICSEARCH_URL` (and optional API key) must be configured; indexing is best-effort and there is no durable index-repair queue yet. |
| Live BullMQ queue visibility | DONE (code) | Authenticated `/api/emails/queue` and `/dashboard/queue` report sender-owned jobs and refresh every five seconds. This is a project-specific queue view, not Bull Board. It needs a running worker/Redis to verify live state. |
| Google OAuth login, user header, logout | PARTIALLY DONE | `frontend/src/lib/auth.ts`, the login page, dashboard server layout, header, and session-checked BFF implement real NextAuth Google sign-in and logout. Valid Google client credentials and callback configuration are required; the OAuth round trip is not verified. |
| Frontend schedule, CSV/TXT parsing, scheduled/sent lists and details | PARTIALLY DONE | Compose, scheduled/sent/detail pages call authenticated same-origin API routes, handle loading/error/empty states, and accept up to 1000 validated recipients. Browser form rendering was tested before real OAuth was enabled; a signed-in database-backed flow still needs credentials and schema. |
| Frontend search and queue dashboard | PARTIALLY DONE | Search and live queue views are wired to authenticated APIs. Search needs Elasticsearch and queue data needs Redis/worker/database. |
| Slack notification after later connection; no Slack connection must not crash worker | PARTIALLY DONE | Missing integration is a no-op; notification errors are logged without failing email jobs. Live provider behavior is not verified. |
| 1000+ scheduled emails and rate-limit overflow | PARTIALLY DONE | Requests allow up to 1000 unique recipients, bulk queue insertion is used, and sender/hour Redis counters defer overflow. Load/performance testing has not been run. |
| Native Windows PostgreSQL 16 + Redis 5.0.14; Docker optional | PARTIALLY DONE | `backend/.env.example` uses native loopback settings; `README.md` and `LOCAL_SETUP_WINDOWS.md` provide verification commands. No Docker is needed by app scripts. The current host has PostgreSQL 16 and 19 services, so port 5432 must be verified before touching the database. BullMQ v5 accepts Redis 5.0.0+, while 6.2+ is recommended. |
| Safe input validation and tenant data access | PARTIALLY DONE | Schedule validation, API token authentication, NextAuth server proxying, and sender-scoped reads are implemented. No independent penetration/security test has been conducted; API rate limiting and per-tenant authorization for every future integration need review. |
| CORS, secrets, errors, shutdown, readiness | PARTIALLY DONE | CORS uses exact configured origins; SMTP credentials are env-only; API/worker have graceful shutdown paths and readiness checks. Production observability, secret rotation, and cloud ingress behavior remain deployment tasks. |
| Cloud deployment preparation, no deployment/spend | PARTIALLY DONE | `CLOUD_DEPLOYMENT.md` documents separate frontend/API/worker and managed dependencies. No resources were created or deployment performed. |
| Figma match | NOT VERIFIED | No Figma access or visual comparison was performed in this execution. |
| Automated checks and tests | PARTIALLY DONE | Phase 2 backend build and 11 focused tests passed; frontend lint and production build passed. A generic BullMQ producer/consumer smoke test passed against the local Memurai service, but the application worker and queue were not tested. Database CRUD, API scheduling, SMTP, Slack, Elasticsearch, OAuth round trips, and worker restart/load tests were blocked by missing credentials/schema/services. See `E2E_TEST_REPORT.md`. |

## Security findings addressed

- Removed hard-coded Ethereal SMTP credentials and fail closed when SMTP credentials are absent.
- Enforced production verified PostgreSQL TLS, authenticated TLS Redis, HTTPS/API-key Elasticsearch, a 32-byte minimum API token, and encrypted SMTP transport.
- Audited frontend and backend dependencies separately. The frontend audit is now clean; one High Effect/Prisma CLI advisory remains in backend tooling and is documented in `SECURITY_AUDIT.md`.
- Hardened optional Docker Compose ports to loopback and require explicit credentials; Docker is not needed to run the application.
- Replaced the fake login redirect with NextAuth Google OAuth and protected dashboard pages.
- Added a server-side API proxy so the backend bearer token is not sent to browser code.
- Scoped email reads and queue views to the authenticated sender.
- Replaced prefix-based CORS matching with exact origin matching.
- Added schedule limits, recipient validation, request-size limits, and generic API errors.
- Encrypts stored Slack credentials with AES-256-GCM; the encryption key is never stored in the database.

## Remaining blockers

1. Configure local credentials in ignored `.env` files; do not send them in chat.
2. Verify PostgreSQL 16 answers on the configured port before creating the database or applying schema changes.
3. Back up the dedicated `email_scheduler` database and explicitly apply the additive Prisma schema update.
4. Configure and verify real Google, Ethereal, Slack, and Elasticsearch services.
5. Execute the full database/queue/SMTP/OAuth/Slack/search/restart/load test matrix before describing the system as production-ready.
