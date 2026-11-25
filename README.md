# ReachInbox Email Scheduler

A TypeScript email-scheduling application using an Express API, PostgreSQL, BullMQ/Redis, a Next.js dashboard, and configurable SMTP. BullMQ delayed jobs are used for scheduling; no cron jobs are used.

## Documentation

- [Native Windows 11 setup](docs/LOCAL_SETUP_WINDOWS.md)
- [Assignment compliance audit](docs/ASSIGNMENT_COMPLIANCE_AUDIT.md)
- [Implementation changelog](docs/IMPLEMENTATION_CHANGELOG.md)
- [Cloud deployment preparation](docs/CLOUD_DEPLOYMENT.md)
- [Security audit and dependency advisory inventory](docs/SECURITY_AUDIT.md)
- [End-to-end test report](docs/E2E_TEST_REPORT.md)
- [Final test report and unverified integrations](docs/FINAL_TEST_REPORT.md)

## Primary local infrastructure

- PostgreSQL 16 as a native Windows service
- Redis 5.0.14 as a native Windows service (BullMQ v5 accepts Redis 5.0.0+, and recommends Redis 6.2+)
- Node.js 22.12 or newer is recommended for the full stack (the Prisma 7.10.1 CLI supports `^20.19`, `^22.12`, or `>=24`; Next.js 16 requires 20.9+).
- Docker is not required. The root Compose file is an optional alternative using PostgreSQL 15 and Redis 7; do not run it on ports already used by native services.

No PostgreSQL installation or database is modified automatically. Verify the PostgreSQL version on the selected port before creating a dedicated project database or applying schema changes.

## Local quick start

Follow [the detailed Windows setup](docs/LOCAL_SETUP_WINDOWS.md) for service checks, environment configuration, OAuth, and verification.

1. Verify PostgreSQL 16 with `SELECT version()` and Redis with `redis-cli PING`.
2. Create/use a dedicated `email_scheduler` database. Review and back up the target before `npm run db:push`.
3. Configure `backend/.env` from `backend/.env.example`. Configure Google OAuth and the matching server-side API token in `frontend/.env.local`, copied from `frontend/.env.example`.
4. Install dependencies with `npm ci`; generate Prisma Client with `npm run db:generate`.
5. Start three terminals:

```powershell
# Terminal 1: API
Set-Location D:\ReachInbox\backend
npm run dev
```

```powershell
# Terminal 2: persistent BullMQ worker
Set-Location D:\ReachInbox\backend
npm run dev:worker
```

```powershell
# Terminal 3: dashboard
Set-Location D:\ReachInbox\frontend
npm run dev
```

The dashboard runs at `http://localhost:3000`; API liveness/readiness are `http://localhost:4000/health/live` and `/health/ready`.

## Architecture and behavior

- The API validates requests, persists email rows in PostgreSQL, and creates stable-ID BullMQ delayed jobs.
- A separate long-running worker processes due jobs and sends through configured SMTP. Ethereal is for test/demo capture, not production delivery.
- Pending PostgreSQL rows are re-enqueued when the worker starts. Redis persistence must also be enabled to retain BullMQ state through Redis restarts.
- A Redis Lua operation coordinates per-sender UTC-hour counters and minimum send spacing across worker instances. Hourly overflow is deferred to the next window rather than permanently failed. Defaults: `MAX_EMAILS_PER_HOUR=200`, `DELAY_BETWEEN_EMAILS_MS=2000`, `WORKER_CONCURRENCY=5`.
- Scheduling requires an `Idempotency-Key`; the authenticated sender is the Google account identity. The Next.js server-side proxy keeps the backend API token out of browser code.
- The dashboard provides scheduled/sent views, search (when Elasticsearch is configured), Slack connection controls, and a five-second polling queue view.
- SMTP cannot guarantee exactly-once delivery across an ambiguous acceptance/network/database failure. Interrupted `PROCESSING` emails are not blindly resent.

## API and integrations

Email endpoints are under `/api/emails` and require `Authorization: Bearer <BACKEND_API_TOKEN>` plus `x-user-email`. The frontend proxy supplies these headers from a validated NextAuth session. Scheduling accepts up to 1000 unique recipient addresses and requires a unique `Idempotency-Key` header.

Optional integrations:

- Google OAuth: configure the Google client and callback `http://localhost:3000/api/auth/callback/google`.
- Ethereal SMTP: configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`.
- Elasticsearch: configure `ELASTICSEARCH_URL` and, if needed, `ELASTICSEARCH_API_KEY`.
- Slack alerts: configure Slack OAuth credentials, callback `http://localhost:4000/api/slack/callback`, and a stable 32-byte `SLACK_TOKEN_ENCRYPTION_KEY`.

Use the `.env.example` files as templates. Never commit actual secrets or expose `BACKEND_API_TOKEN` through a `NEXT_PUBLIC_` variable.

## Validation

```powershell
# From backend
npm test

# From frontend
npm run lint
npm run build
```

Passing these checks does not prove database, Redis worker, SMTP, Google OAuth, Slack, or Elasticsearch connectivity. The [test report](docs/FINAL_TEST_REPORT.md) lists completed and outstanding verification.
