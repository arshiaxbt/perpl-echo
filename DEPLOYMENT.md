# Perpl Echo Deployment Guide

This guide deploys Perpl Echo with three separate targets:

- Web: Vercel Next.js app and API routes
- Worker: Railway or VPS long-running Node process
- Database: external hosted Postgres

Do not deploy the worker inside Vercel. Vercel builds and serves the web app only. Do not use Docker-only hostnames such as `postgres` outside local Docker Compose.

## Production Commands

Use these commands for hosted Postgres:

```bash
npm install
npm run db:generate
npm run db:migrate
```

`npm run db:migrate` runs `prisma migrate deploy`. Do not use `prisma migrate dev` in production.

## Option A: GitHub + Supabase/Neon + Vercel + Railway

### 1. Create GitHub Repo

Create a new empty GitHub repository. Do not initialize it with a README if your local folder already has one.

### 2. Push Code

From the project folder:

```bash
git init
git add .
git commit -m "Prepare Perpl Echo deployment"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 3. Create External Postgres

Create a new Postgres database in Supabase or Neon.

For Supabase, use the pooled or direct connection string recommended for server-side apps. For Neon, use the pooled connection string for Vercel if available.

### 4. Copy `DATABASE_URL`

Copy the hosted Postgres connection string. It should look like:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Keep this secret. Do not commit it.

### 5. Run Migrations

From your local project folder:

```bash
DATABASE_URL="<hosted-postgres-url>" npm run db:generate
DATABASE_URL="<hosted-postgres-url>" npm run db:migrate
```

This creates all Prisma tables, including `WorkerRun`.

### 6. Deploy Vercel

In Vercel:

1. Import the GitHub repository.
2. Framework preset: Next.js.
3. Build command: `npm run build`.
4. Output settings: leave default.

### 7. Set Vercel Env Vars

Set these in Vercel Project Settings -> Environment Variables:

```bash
DATABASE_URL=<hosted-postgres-url>
NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
NEXT_PUBLIC_ENABLE_WALLET_FEATURES=false
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
ONCHAIN_INDEXER_ENABLED=false
```

Redeploy after saving env vars.

### 8. Deploy Worker On Railway

In Railway:

1. Create a new project.
2. Deploy from the same GitHub repository.
3. Choose an empty service from the repo.
4. Set the start command to:

```bash
npm run worker
```

Railway should install dependencies with `npm install`.

### 9. Set Worker Env Vars

Set these on the Railway worker service:

```bash
DATABASE_URL=<hosted-postgres-url>
WORKER_NAME=perpl-echo-railway-worker
PERPL_API_BASE_URL=https://app.perpl.xyz
MONAD_RPC_URL=https://rpc.monad.xyz
PERPL_CHAIN_ID=143
PERPL_CONTRACT_ADDRESSES=0x34b6552d57a35a1d042ccae1951bd1c370112a6f
ONCHAIN_INDEXER_ENABLED=true
ONCHAIN_START_BLOCK=
ONCHAIN_POLL_INTERVAL_MS=5000
SNAPSHOT_COLLECTOR_ENABLED=true
WORKER_ENABLED=true
COLLECTOR_INTERVAL_MS=300000
BACKFILL_ON_START=false
BACKFILL_DAYS=30
BACKFILL_MIN_SNAPSHOTS=100
```

The repository includes `railway.json`, which sets Railway's start command to `npm run worker`. Do not set the Railway start command to `npm run start`; Vercel serves the web app.

### 10. Start Worker

Deploy or restart the Railway service. The logs should include:

```text
[worker] started
[collector] success
[onchain] latestBlock=
[derived] snapshotsClassified=
[worker] cycle durationMs=
```

### 11. Verify Database Filling

Open your Postgres SQL editor and run:

```sql
SELECT COUNT(*) FROM "Market";
SELECT COUNT(*) FROM "MarketSnapshot";
SELECT COUNT(*) FROM "WorkerRun";
SELECT * FROM "WorkerRun" ORDER BY "startedAt" DESC LIMIT 5;
```

`WorkerRun` should show `success` rows after the worker completes cycles.

### 12. Verify Website Works

Open:

```text
https://<your-vercel-domain>/api/health
https://<your-vercel-domain>/api/worker-status
https://<your-vercel-domain>/markets
```

`/api/health` should return `ok: true` and `databaseConnected: true`.

### 13. Check Logs

Check:

- Vercel deployment logs for build or API errors
- Vercel function logs for runtime API errors
- Railway worker logs for collector/indexer failures
- Postgres dashboard for connection limits and table growth

### 14. Common Errors And Fixes

`DATABASE_URL is required for the worker target.`

Set `DATABASE_URL` on the worker service.

`Can't reach database server`

Use the external hosted Postgres URL. Do not use `postgres`, `localhost`, or a Docker network hostname on Vercel or Railway.

`relation "Market" does not exist`

Run `DATABASE_URL="<hosted-postgres-url>" npm run db:migrate`.

Vercel build fails during Prisma generation

Make sure `DATABASE_URL` is set in Vercel. Prisma client generation reads the schema and environment.

Worker exits after one cycle

Use `npm run worker` for always-on services. `npm run worker:once` is only for tests and one-shot jobs.

No on-chain data appears

Check `MONAD_RPC_URL`, `PERPL_CONTRACT_ADDRESSES`, and `ONCHAIN_INDEXER_ENABLED=true`. The app still works with public Perpl snapshot data if on-chain indexing is unavailable.

Rarity or confidence says collecting data

This is expected until the worker has collected enough history. Rarity and market memory require at least 24 hours of snapshots and 100 snapshots. Echo confidence requires at least 10 historical matches with forward outcomes.

## Option B: GitHub + Supabase/Neon + Vercel + VPS Worker

### 1. Create GitHub Repo

Create a new empty GitHub repository.

### 2. Push Code

```bash
git init
git add .
git commit -m "Prepare Perpl Echo deployment"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 3. Create External Postgres

Create a hosted Postgres database in Supabase or Neon.

### 4. Copy `DATABASE_URL`

Copy the hosted Postgres URL and keep it secret.

### 5. Run Migrations

```bash
DATABASE_URL="<hosted-postgres-url>" npm run db:generate
DATABASE_URL="<hosted-postgres-url>" npm run db:migrate
```

### 6. Deploy Vercel

Import the GitHub repository into Vercel with:

```bash
npm run build
```

as the build command.

### 7. Set Vercel Env Vars

```bash
DATABASE_URL=<hosted-postgres-url>
NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
NEXT_PUBLIC_ENABLE_WALLET_FEATURES=false
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
ONCHAIN_INDEXER_ENABLED=false
```

Redeploy the Vercel project.

### 8. Deploy Worker On VPS

SSH into the VPS and install Node.js 22 or newer. Then clone the repo:

```bash
git clone <your-github-repo-url> perpl-echo
cd perpl-echo
npm install
npm run db:generate
```

### 9. Set Worker Env Vars

Create a `.env` file on the VPS:

```bash
DATABASE_URL=<hosted-postgres-url>
WORKER_NAME=perpl-echo-vps-worker
PERPL_API_BASE_URL=https://app.perpl.xyz
MONAD_RPC_URL=https://rpc.monad.xyz
PERPL_CHAIN_ID=143
PERPL_CONTRACT_ADDRESSES=0x34b6552d57a35a1d042ccae1951bd1c370112a6f
ONCHAIN_INDEXER_ENABLED=true
ONCHAIN_START_BLOCK=
ONCHAIN_POLL_INTERVAL_MS=5000
SNAPSHOT_COLLECTOR_ENABLED=true
WORKER_ENABLED=true
COLLECTOR_INTERVAL_MS=300000
BACKFILL_ON_START=false
BACKFILL_DAYS=30
BACKFILL_MIN_SNAPSHOTS=100
```

### 10. Start Worker

For a quick foreground test:

```bash
npm run worker:once
```

For an always-on process, use `systemd`:

```ini
[Unit]
Description=Perpl Echo Worker
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/perpl-echo
EnvironmentFile=/home/ubuntu/perpl-echo/.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=10
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable perpl-echo-worker
sudo systemctl start perpl-echo-worker
sudo journalctl -u perpl-echo-worker -f
```

### 11. Verify Database Filling

Run in your hosted Postgres SQL editor:

```sql
SELECT COUNT(*) FROM "Market";
SELECT COUNT(*) FROM "MarketSnapshot";
SELECT COUNT(*) FROM "WorkerRun";
SELECT * FROM "WorkerRun" ORDER BY "startedAt" DESC LIMIT 5;
```

### 12. Verify Website Works

Open:

```text
https://<your-vercel-domain>/api/health
https://<your-vercel-domain>/api/worker-status
https://<your-vercel-domain>/markets
```

### 13. Check Logs

Use:

```bash
sudo journalctl -u perpl-echo-worker -f
```

Also check Vercel function logs and the Postgres provider dashboard.

### 14. Common Errors And Fixes

`npm: command not found`

Install Node.js 22 or newer and make sure the `systemd` `ExecStart` path points to the real `npm` path from `which npm`.

Worker starts but no snapshots appear

Run `npm run worker:once` in the project folder and read the collector error. Check database network access and `PERPL_API_BASE_URL`.

API health says database disconnected

Set the same external `DATABASE_URL` in Vercel and redeploy.

Build passes but pages are empty

The worker has not filled the database yet. Check `WorkerRun`, worker logs, and `/api/worker-status`.

Postgres connection limit errors

Use your provider's pooled connection string for Vercel, reduce concurrent deployments, or upgrade the database plan.

## Local Docker Compose Remains Separate

Local Compose may use:

```text
postgres:5432
```

inside the Docker network. Hosted Vercel and hosted workers must use the external Postgres URL.
