# End-to-End Test Report

## Result

The critical authenticated email-delivery workflow is **not verified**. No real email was sent, no database was modified, and no existing PostgreSQL service was reconfigured. Tests stopped at explicit environment blockers rather than claiming success.

## Environment and safety

- Windows 11; Node.js 22.14.0; npm 10.9.2.
- `backend/.env` and `frontend/.env.local` are absent. The backend API was not listening on port 4000 during verification.
- Backend environment loading is now resolved relative to the backend module, independent of the current working directory; this was smoke-tested from the repository root with a temporary non-secret variable. The real database URL is still absent and must be configured locally.
- PostgreSQL 16 service was running and configured for port 5432; TCP accepted connections. The server version could not be confirmed with SQL because `psql -w` could not authenticate without a password. No database or schema operation was performed. PostgreSQL 19 on port 5550 was left untouched.
- The running Redis-compatible Windows service is Memurai (service version 8.2.1; Redis protocol reports 8.2.11), not the requested Redis 5.0.14. Redis `PING` returned `PONG`. RDB snapshots are configured and the last save succeeded; AOF is disabled. No service restart or durability test was performed.
- SMTP credentials, Google OAuth credentials, Slack credentials, and Elasticsearch credentials/service configuration were not present. No test or real email was sent.

## Workflow verification matrix

| Workflow step | Result | Evidence / blocker |
|---|---|---|
| User authentication | **Partially verified** | Frontend login page rendered at `http://localhost:3000/login`. Navigating to `/dashboard` without a session redirected to `/login`. A Google OAuth round trip could not be completed because Google client credentials and callback configuration are missing. |
| Create/configure campaign and add recipients | **Not run** | Requires successful authentication and the project database. |
| Schedule an email through the API | **Not run** | API was not running with environment configuration; PostgreSQL authentication was unavailable. |
| Persist email/campaign state | **Not run** | Prisma was not connected to PostgreSQL. No `db:push`, migration, or CRUD operation was run. |
| Persist a BullMQ delayed job | **Partially verified** | A temporary generic BullMQ producer/consumer smoke test completed successfully against the local Redis-compatible service and cleaned up its unique test queue. This did not use the application email queue or database. |
| Execute with the application worker | **Not run** | The application worker was not started because its database and SMTP settings were unavailable. Recovery-from-database and application worker startup/shutdown therefore remain unverified. |
| Send with test SMTP | **Not run, intentionally** | No Ethereal credentials were configured. No message was sent; real delivery was not attempted. Production SMTP now requires a configured host and TLS/STARTTLS, but provider connectivity was not tested. |
| Persist sent/failed status and retry behavior | **Not run** | Requires the database-backed worker and SMTP flow. |
| Prevent duplicate scheduling/delivery | **Code-reviewed, not E2E verified** | The API uses request idempotency keys and deterministic job IDs; the worker claims pending rows before sending. The SMTP-acceptance/database-commit boundary cannot provide true exactly-once delivery. No duplicate-send test was run. |
| Time-zone correctness | **Partially code-verified** | The browser converts its local `datetime-local` value to an ISO timestamp before submission; the API parses and stores a JavaScript `Date`, and queue delay uses the UTC epoch timestamp. Validation tests cover valid future and past instants, but no database round trip or DST/time-zone integration test was possible. |
| Rate-limit delay and Slack alert | **Not run** | Redis Lua reservation logic is present; a connected Slack workspace and application worker were unavailable. No multi-worker concurrency/limit test was run. |
| Elasticsearch indexing/search | **Not run** | No Elasticsearch endpoint or API key was configured. Production configuration rejects non-HTTPS endpoints and requires an API key. |
| Google OAuth, Slack OAuth, and callback handling | **Blocked** | The frontend protects the dashboard and exposes provider flows, but no provider credentials/callbacks were configured; no successful external OAuth result is claimed. |

## Checks that did pass

- Backend `npm test`: TypeScript build and 11 focused tests passed, including schedule validation and production DB/Redis/Elasticsearch/SMTP configuration checks.
- Frontend `npm run lint`: passed.
- Frontend `npm run build`: passed using Next.js 16.4.6.
- Native Redis-compatible service: `PING` passed.
- Generic BullMQ producer/consumer smoke test: passed against the local service.
- Browser route check: unauthenticated dashboard access redirected to the login page.

## To complete the blocked workflow safely

1. Configure ignored `backend/.env` and `frontend/.env.local` locally; do not send credentials in chat.
2. Verify the PostgreSQL 16 server/version and port using an authorized account. Back up the dedicated project database before reviewing/applying the Prisma schema; do not target an unrelated database.
3. Configure Google OAuth callback `http://localhost:3000/api/auth/callback/google`, sign in, and use only a test account.
4. Configure an Ethereal test mailbox and send only to an address controlled by the tester. Confirm queued, delayed, delivered, failed/retried, and duplicate-idempotency behavior.
5. Test a future timestamp across the tester's time zone/DST boundary and compare the stored UTC instant and actual queue execution.
6. Configure Slack/Elasticsearch only if demonstrating those integrations; verify the exact callback, sender-scoped search, and rate-limit alert.
7. Test restart recovery and multiple workers only against a dedicated test database/Redis namespace with persistence settings understood and approved.

Until these tests pass, end-to-end scheduler reliability and production readiness remain unverified.
