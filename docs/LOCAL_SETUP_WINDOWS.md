# Native Windows 11 Setup

This is the primary local setup. Docker is optional. Do not stop, reconfigure, upgrade, or uninstall any unrelated PostgreSQL installation. The version requested for this setup is Redis 5.0.14; the currently inspected Windows service is Memurai, which reports Redis-compatible version 8.2.11. Do not downgrade it to make the reported version match.

## Prerequisites

- Node.js 22.12 or newer is recommended for the full stack. Next.js 16 requires Node.js 20.9+, while the installed Prisma 7.10.1 CLI supports `^20.19`, `^22.12`, or `>=24`.
- PostgreSQL 16 running as a Windows service
- Redis 5.0.14 running natively (BullMQ v5 accepts Redis 5.0.0+, but recommends 6.2+)
- An Ethereal account for sending tests
- A Google OAuth client for dashboard sign-in

## 1. Identify and verify PostgreSQL 16

Use PowerShell:

```powershell
Get-Service *postgres* | Format-Table Name, Status
Test-NetConnection 127.0.0.1 -Port 5432
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT version();"
```

Only continue when the query reports PostgreSQL 16. This host may have multiple PostgreSQL services. If another version answers on port 5432, use PostgreSQL 16's already-configured port in every command and in `DATABASE_URL`; do not change another service. If `psql` is not on `PATH`, run `& "$env:ProgramFiles\PostgreSQL\16\bin\psql.exe" ...`.

If PostgreSQL 16 is stopped, start only that service by its exact service name, from elevated PowerShell if needed:

```powershell
Start-Service -Name "postgresql-x64-16"
```

Create the project database only if it does not already exist:

```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "CREATE DATABASE email_scheduler;"
psql -h 127.0.0.1 -p 5432 -U postgres -d email_scheduler -c "SELECT version(), current_database();"
```

Substitute your existing PostgreSQL role and PostgreSQL 16 port as needed. Do not run these commands against an unrelated database.

## 2. Verify native Redis-compatible service

```powershell
Get-Service *redis*,*memurai* | Format-Table Name, Status
Test-NetConnection 127.0.0.1 -Port 6379
redis-cli -h 127.0.0.1 -p 6379 PING
redis-cli -h 127.0.0.1 -p 6379 INFO server
redis-cli -h 127.0.0.1 -p 6379 CONFIG GET appendonly
redis-cli -h 127.0.0.1 -p 6379 CONFIG GET save
redis-cli -h 127.0.0.1 -p 6379 INFO persistence
```

Expect `PONG` from the ping. If it is not installed as a Windows service, run the existing Redis-compatible server from its installed directory in a separate terminal. Verify the reported `redis_version`; BullMQ v5's minimum is 5.0.0 and 6.2+ is recommended. The current host was found to run Memurai, reporting Redis protocol version 8.2.11; it is not the requested Redis 5.0.14 installation, and it has not been changed.

BullMQ jobs are stored in Redis. For restart durability, Redis must have persistence enabled and its data directory must persist. The inspected Memurai service reports `appendonly=no`, but RDB snapshots are configured and `INFO persistence` reported a successful last save. This provides snapshot persistence, not the stronger write durability of AOF; unsaved writes can be lost after a crash. A service restart/durability test has not been performed. Inspect the existing Redis configuration before changing it; do not apply configuration changes without understanding their effect on other users of that Redis instance.

## 3. Configure the backend

```powershell
Set-Location D:\ReachInbox\backend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Set `DATABASE_URL` to the verified PostgreSQL 16 host/port, database, role, and URL-encoded password. Keep `REDIS_HOST=127.0.0.1` and `REDIS_PORT=6379` for the native service. Generate a long random `BACKEND_API_TOKEN`; put the same value in `backend/.env` and `frontend/.env.local`. Set Ethereal `SMTP_USER` and `SMTP_PASS`. Do not commit either `.env` file.

The backend loads `backend/.env` relative to its own source/build location, so starting the process from the repository root or the `backend` directory uses the same file. Replace the example password before starting; the application intentionally fails fast if `DATABASE_URL` is missing.

Generate random values locally with Node.js, and use distinct values for each secret (the API token is the exception: it must match in backend and frontend). Production rejects API tokens shorter than 32 bytes, requires authenticated TLS Redis URLs, and requires PostgreSQL `sslmode=verify-full`; these production-only requirements do not apply to loopback development services:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Generate Prisma Client, then review the schema target carefully before applying it:

```powershell
npm run db:generate
npm run db:push
```

`db:push` changes the selected database schema. Use the dedicated `email_scheduler` database, verify it is PostgreSQL 16, and back it up first. Do not run it against an unrelated/shared database. The current machine's PostgreSQL 16 service is configured for port 5432 and PostgreSQL 19 for 5550; a read-only connection reached port 5432 but was blocked at authentication because no password was available. No database operation was performed.

## 4. Configure the frontend and OAuth

```powershell
Set-Location D:\ReachInbox\frontend
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
```

Set Google OAuth credentials and `NEXTAUTH_SECRET`. Register the Google redirect URI `http://localhost:3000/api/auth/callback/google`. Match the frontend server-side `BACKEND_API_TOKEN` to the backend value. Set `BACKEND_API_URL=http://localhost:4000/api`. The API token must not use a `NEXT_PUBLIC_` variable.

## 5. Start three processes

Run each command in its own PowerShell terminal:

```powershell
Set-Location D:\ReachInbox\backend
npm run dev
```

```powershell
Set-Location D:\ReachInbox\backend
npm run dev:worker
```

```powershell
Set-Location D:\ReachInbox\frontend
npm run dev
```

The frontend is at `http://localhost:3000`, API liveness at `http://localhost:4000/health/live`, and API readiness at `http://localhost:4000/health/ready`.

## 6. Optional assignment integrations

### Elasticsearch

Set `ELASTICSEARCH_URL` (and `ELASTICSEARCH_API_KEY` where required) in `backend/.env`. The backend indexes emails into `reachinbox-emails`; the dashboard search requires this service. If it is not configured, search returns an explicit `503`, not fake results.

### Slack OAuth notifications

Create a Slack app with `incoming-webhook` and `chat:write` scopes. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback`, and a fresh 32-byte `SLACK_TOKEN_ENCRYPTION_KEY` in `backend/.env` (generate a separate random value with the Node.js command above). Register the exact redirect URI in Slack. Connect from the dashboard's Queue page. The token encryption key must remain stable and backed up; losing it makes stored integration tokens unreadable.

## 7. Verification

From `backend`:

```powershell
npm run build
npm test
npm run db:generate
```

From `frontend`:

```powershell
npm run lint
npm run build
```

Then verify:

```powershell
Invoke-RestMethod http://localhost:4000/health/live
Invoke-RestMethod http://localhost:4000/health/ready
```

Sign in with the configured Google account. Schedule a test only to a recipient you control; Ethereal captures the message rather than delivering it to a real mailbox. Confirm its scheduled state, queue view, sent/failed view, Elasticsearch search result (if configured), and Slack message on an hourly-limit event (if configured).

Do not treat a successful Redis `PING` as proof that the worker can process BullMQ jobs; verify with a controlled scheduled test. Do not treat a successful build as proof of DB, SMTP, Slack, or Elasticsearch connectivity.
