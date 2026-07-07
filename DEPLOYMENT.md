# Perpl Echo Deployment Guide

This guide deploys Perpl Echo with three separate production targets:

- Web: Vercel Next.js app and API routes
- Worker: Railway long-running Node process
- Database: Supabase PostgreSQL

Do not deploy the worker inside Vercel. Vercel builds and serves the web app only. Do not use Docker-only hostnames such as `postgres` outside local Docker Compose.

## Production Commands

Use these commands for Supabase Postgres:

```bash
npm install
npm run db:generate
npm run db:migrate
```

`npm run db:migrate` runs `prisma migrate deploy`. Do not use `prisma migrate dev` in production.

## Supabase Connection Strings

Use Supabase's pooled connection string for app traffic when available:

```bash
DATABASE_URL=<supabase-pooled-connection-string>
```

Use Supabase's direct connection string for Prisma migrations:

```bash
DIRECT_URL=<supabase-direct-connection-string>
```

Keep both secret. Do not commit `.env` files.

## Neon Migration Paths

### Path A: Neon Accessible

If Neon becomes accessible again, export data from Neon and import it into Supabase before switching Vercel/Railway.

Use `pg_dump`/`pg_restore` or provider tools. Verify counts after import:

```sql
SELECT COUNT(*) FROM "Market";
SELECT COUNT(*) FROM "MarketSnapshot";
SELECT COUNT(*) FROM "WorkerRun";
```

### Path B: Neon Inaccessible

If Neon is blocked by the monthly network transfer limit, start fresh on Supabase.

Run Prisma migrations on Supabase, then let the Railway worker collect current market data and run a guarded candle backfill. Do not fake historical migration. Document that historical Neon rows were not migrated because Neon transfer quota was exceeded.

## Vercel Web Env Vars

Set these in Vercel Project Settings -> Environment Variables:

```bash
DATABASE_URL=<supabase-pooled-connection-string>
DIRECT_URL=<supabase-direct-connection-string>
NEXT_PUBLIC_APP_URL=https://perpl-echo.vercel.app
NEXT_PUBLIC_ENABLE_WALLET_FEATURES=false
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
ONCHAIN_INDEXER_ENABLED=false
```

Redeploy Vercel after changing env vars.

## Railway Worker

The repository includes `railway.json`, which sets Railway's start command to:

```bash
npm run worker
```

Railway should run only the worker target. It should not run `npm run start` or serve the Next.js web app.

Set these on the Railway worker service:

```bash
DATABASE_URL=<supabase-pooled-connection-string>
DIRECT_URL=<supabase-direct-connection-string>
WORKER_NAME=perpl-echo-railway-worker
PERPL_API_BASE_URL=https://app.perpl.xyz
MONAD_RPC_URL=https://rpc.monad.xyz
PERPL_CHAIN_ID=143
PERPL_CONTRACT_ADDRESSES=0x34b6552d57a35a1d042ccae1951bd1c370112a6f
ONCHAIN_INDEXER_ENABLED=false
SNAPSHOT_COLLECTOR_ENABLED=true
WORKER_ENABLED=true
COLLECTOR_INTERVAL_MS=300000
ONCHAIN_POLL_INTERVAL_MS=5000
BACKFILL_ON_START=true
BACKFILL_FORCE=false
BACKFILL_DAYS=7
BACKFILL_MIN_SNAPSHOTS=100
RETENTION_ENABLED=true
RAW_SNAPSHOT_RETENTION_DAYS=30
RAW_ONCHAIN_EVENT_RETENTION_DAYS=7
```

Keep on-chain disabled initially. Enable it later only after snapshot collection is stable.

## Verification

After Supabase, Vercel, and Railway are configured:

```bash
curl https://perpl-echo.vercel.app/api/health
curl https://perpl-echo.vercel.app/api/worker-status
curl https://perpl-echo.vercel.app/api/markets
```

Expected:

- `/api/health` returns `ok: true` once snapshots are fresh.
- `/api/worker-status` shows `WORKER_NAME=perpl-echo-railway-worker` in recent successful runs.
- `MarketSnapshot` count increases every 5 minutes.
- `/markets` and market detail pages are dynamic and read fresh Supabase state.

## Disable VPS Worker After Railway Works

Only after Railway is writing fresh Supabase snapshots:

```bash
systemctl list-units | grep -i perpl
sudo systemctl stop perpl-echo-worker
sudo systemctl disable perpl-echo-worker
sudo systemctl status perpl-echo-worker
```

Do not delete VPS files.

After stopping the VPS worker, wait for one Railway cycle and verify snapshot count increases again.

## Free-Tier Protection

Perpl Echo includes retention and usage controls:

- Keeps 5-minute snapshots for 30 days.
- Aggregates older snapshots into hourly summaries in `MarketHourlySnapshot`.
- Keeps hourly summaries indefinitely.
- Keeps raw on-chain logs for only 7 days when on-chain indexing is enabled.
- On-chain indexing is disabled by default.
- Startup backfill records a successful backfill and does not repeat unless `BACKFILL_FORCE=true`.
- Timeline ranges are limited to `1h`, `4h`, `24h`, or `7d`.
- Public JSON responses strip `rawJson`.
- Health warns when latest snapshot is older than 10 minutes or no worker succeeded in 15 minutes.

## Common Errors

`DATABASE_URL is required for the worker target.`

Set `DATABASE_URL` on Railway.

`Can't reach database server`

Use the Supabase connection string, not Neon and not a Docker hostname. Check whether your pooled and direct URLs are assigned to the right env vars.

`relation "Market" does not exist`

Run migrations against Supabase:

```bash
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:migrate
```

Vercel pages return 500

Check Vercel `DATABASE_URL` and `DIRECT_URL`, then redeploy.

Railway runs the web server

Confirm Railway start command is `npm run worker` and `railway.json` is present.

No historical matches appear

This is expected until enough forward outcome windows exist. The 7-day candle backfill improves price/volume/return coverage but does not reconstruct exact historical funding or on-chain context.
