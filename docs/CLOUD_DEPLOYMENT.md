# Cloud Deployment Preparation

No deployment or cloud resource creation has been performed. This guide describes a deployment shape; configure provider-specific networking and secrets before use.

## Required services

Use Node.js 22.12+ for both backend API/worker and the Next.js frontend; the installed Prisma 7.10.1 CLI supports `^20.19`, `^22.12`, or `>=24`.

1. **Next.js frontend** on a Node.js-capable platform that supports NextAuth routes and server-side environment variables.
2. **Express API** as a persistent Node.js service.
3. **BullMQ worker** as a separate persistent Node.js process/service. Do not run it as a serverless function.
4. **Managed PostgreSQL** (PostgreSQL 16 recommended).
5. **Managed Redis-compatible service** that meets BullMQ v5 requirements (Redis 6.2+ recommended), with TLS/authentication, persistence and `noeviction` policy. Do not use the inspected local Memurai configuration as a production durability baseline: it has RDB snapshots but AOF is disabled and restart durability was not tested.
6. **Elasticsearch-compatible service** for email indexing and search.
7. **Ethereal SMTP for test/demo only** or a production SMTP provider for real delivery.
8. **Slack app** with OAuth and incoming-webhook/chat-write scopes if Slack alerts are enabled.

## Production environment variables

### Backend API and worker (same application configuration)

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL` (PostgreSQL URL with `sslmode=verify-full` in production)
- `DATABASE_POOL_MAX`
- `REDIS_URL` (production requires an authenticated `rediss://` URL)
- `BACKEND_API_TOKEN` (same value server-side in the frontend; production requires at least 32 bytes)
- `CORS_ORIGINS` (comma-separated exact trusted origins; no wildcard)
- `FRONTEND_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (production host is explicit; port 465 uses implicit TLS and other ports require STARTTLS)
- `MAX_EMAILS_PER_HOUR`, `DELAY_BETWEEN_EMAILS_MS`, `WORKER_CONCURRENCY`
- `ELASTICSEARCH_URL` (production requires HTTPS), `ELASTICSEARCH_API_KEY` (required in production)
- For Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_TOKEN_ENCRYPTION_KEY`

### Frontend

- `NEXTAUTH_URL` (public HTTPS origin)
- `NEXTAUTH_SECRET` (unique production value)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `BACKEND_API_URL` (private/reachable API origin)
- `BACKEND_API_TOKEN` (same value as the backend; server-only, never `NEXT_PUBLIC_`)

Use the platform's secret manager. Do not put actual values in source control, build arguments, logs, or documentation. Set Google OAuth's exact HTTPS callback to `https://<frontend-origin>/api/auth/callback/google`; set Slack's exact HTTPS callback to the configured `SLACK_REDIRECT_URI` (the backend's `/api/slack/callback` route). Keep `NEXTAUTH_URL`, `FRONTEND_URL`, and `CORS_ORIGINS` aligned with the actual public origins.

## Build and start commands

Install with lockfiles:

```powershell
cd backend
npm ci
npm run build
```

Run the API as one persistent process:

```powershell
npm start
```

Run the worker as a separate persistent process:

```powershell
npm run start:worker
```

Build and run the frontend in its platform's Node runtime:

```powershell
cd frontend
npm ci
npm run lint
npm run build
npm start
```

The frontend process needs server-only OAuth and backend proxy secrets at runtime.

## Database deployment and order

1. Provision managed PostgreSQL, Redis, Elasticsearch, SMTP, and (if used) Slack app credentials.
2. Store production secrets in the secret manager and deploy the backend API configuration.
3. This repository currently has no checked-in `prisma/migrations` and uses `prisma db push` for local schema setup. Do not run `npm run db:push` in production. For a new, empty production database, generate an initial migration from the current schema, review the SQL, and commit it:

   ```powershell
   Set-Location D:\ReachInbox\backend
   New-Item -ItemType Directory -Force prisma\migrations\20261125110500_initial
   npx prisma migrate diff --from-empty --to-schema=prisma\schema.prisma --script --output prisma\migrations\20261125110500_initial\migration.sql
   ```

   Test that migration against a disposable staging database before deployment. After the reviewed migration is committed, `npx prisma migrate deploy` applies it to a new production database. For an existing database whose schema was created with `db push`, first back it up and compare its schema with the migration; only then use `npx prisma migrate resolve --applied 20261125110500_initial` to baseline it. Never mark a migration applied or deploy it to an existing database until schema equivalence is confirmed.
4. Back up the target PostgreSQL database and review every migration for destructive statements before production use.
5. Start the API and worker with the same database/Redis configuration. The worker must stay online independently of HTTP traffic.
6. Deploy the frontend with its OAuth and server-side API proxy configuration.
7. Configure Google and Slack callback URLs, CORS exact origins, TLS, and provider egress rules.
8. Run the production verification below before accepting traffic.

The current repository does not yet include checked-in Prisma migration files. Production rollout is not ready until an explicit reviewed migration is created and tested against a staging database.

## Health checks, observability, and production verification

- Liveness: API `GET /health/live`.
- Readiness: API `GET /health/ready` checks PostgreSQL and Redis only. It does not check SMTP, Elasticsearch, Slack, or the background worker.
- The worker is a separate process with startup recovery and signal-based shutdown, but this repository has no worker health endpoint or heartbeat. Use the platform supervisor to restart a failed worker and add an external worker heartbeat/alert before production.
- Confirm Redis persistence, `noeviction`, TLS/auth, and network restrictions.
- Confirm Elasticsearch index access and run a sender-scoped search.
- Complete a controlled Ethereal/SMTP test and confirm scheduled-to-sent status.
- Exercise a rate-limit deferral across multiple worker instances and verify exactly one Slack alert for a connected sender.
- Restart the API and worker and confirm delayed jobs remain pending at their original schedule.
- Verify session-protected routes reject unauthenticated users and one sender cannot read another sender's records.
- API and worker currently use `console` logs; structured logging, metrics, tracing, alert routing, and queue dashboards/retention policies are not configured. Add and verify these operational controls before production. Ensure logs do not contain credentials, tokens, message bodies, or full SMTP/Slack URLs.

## Readiness caveats

This repository is deployment-prepared, not production-certified. At the Phase 2 audit, frontend npm audit is clean; backend npm audit retains one High Effect/Prisma tooling advisory (three package-graph records). OAuth/SMTP/Slack/Elasticsearch credentials, staging migration validation, load tests, observability/alerts, Redis restart testing, and a verified SMTP failure policy remain required. SMTP cannot guarantee true exactly-once delivery across an accepted message and a subsequent database/network failure. See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) and [E2E_TEST_REPORT.md](./E2E_TEST_REPORT.md).

## Cloudflare-native deployment option (separate evaluation)

**Decision: do not deploy the current API/worker unchanged to ordinary Cloudflare Workers, and do not migrate without approval.** The current repository is a persistent Express + BullMQ + ioredis + Prisma/`pg` + Nodemailer application. Cloudflare has Node.js compatibility and an HTTP-server bridge, but the entry point here depends on `app.listen()`, long-lived processes, signal-based shutdown, a BullMQ worker loop, and long-lived Redis connections. A Worker entry point and integration-specific testing would be needed; compatibility is not established by a successful Node build.

- **API:** Workers documents Node HTTP server APIs with `httpServerHandler`, but that is an adapter into the Worker request lifecycle, not deployment of this existing Node process. The API would need a Worker entry point and request/response, startup, error, and health-check tests.
- **Queue and worker:** BullMQ/ioredis must not be assumed to run as the existing persistent background worker. Workers do not allow TCP sockets to be created globally and shared across requests. Cloudflare Queues would be a replacement with different at-least-once delivery, batch/retry semantics, and consumer concurrency. Queue delay is capped at 24 hours; longer schedule horizons need a durable timer design (for example Durable Object alarms) plus database reconciliation. Idempotency and per-sender atomic rate limiting would need to be reimplemented and tested.
- **Database:** Cloudflare documents PostgreSQL connectivity through Hyperdrive, including Prisma integration. The developer's local Windows PostgreSQL is not a Cloudflare-reachable database; use a managed database or a supported private-network path such as Workers VPC. The current Prisma adapter/configuration would require a Cloudflare-specific connection path and lifecycle tests.
- **SMTP:** Cloudflare blocks outbound TCP port 25. This project's Ethereal port 587 path and Nodemailer/TLS compatibility have not been tested on Workers. Do not assume it works; use a tested HTTPS email provider or another supported mail runtime if migrating.
- **Search and OAuth:** The Elasticsearch Node client, NextAuth Google callback flow, and Slack OAuth callback need separate Workers compatibility and session/cookie tests. Cloudflare recommends vinext for new/modern Next.js-on-Workers deployments; OpenNext remains another documented path, but either requires a migration/build validation for this existing app.
- **Persistent Node container alternative:** Cloudflare Containers can run containerized processes through a Durable Object, but container lifecycle can stop/restart instances and disk is ephemeral by default. This is a separate container deployment option, not an always-on Worker, and still needs external durable PostgreSQL/Redis plus lifecycle/queue recovery tests.
- **Operations:** Replace process-signal shutdown and conventional liveness/readiness checks with Worker/Queue/Container lifecycle-aware health reporting and Cloudflare logs, traces, metrics, and alerts. No Cloudflare configuration, cost, or deployment has been tested or created.

Official references (reviewed 2026-11-24):

- [Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Node.js HTTP server compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Workers TCP sockets and restrictions](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Cloudflare Queues delays, batches, retries, and delivery](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Cloudflare Queues JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)
- [Prisma ORM through Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/prisma-orm/)
- [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/)
- [Workers observability](https://developers.cloudflare.com/workers/observability/)
