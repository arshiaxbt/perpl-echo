# Perpl Echo Free Deployment Guide

Production uses only free-friendly infrastructure:

- Web: Vercel Free
- Database: Supabase Free PostgreSQL
- Worker: GitHub Actions scheduled `npm run worker:once`

Do not use Neon, Railway, a VPS worker, Vercel Cron, or any always-on paid compute for production.

## Architecture

```text
GitHub Actions schedule
  -> npm run worker:once
  -> Perpl public API
  -> Supabase Postgres

Vercel Free
  -> Next.js web app and API routes
  -> Supabase Postgres
```

The worker exits after one cycle. It does not sleep forever and does not serve the web app.

## Supabase Env Vars

Use Supabase pooler URLs:

```bash
DATABASE_URL=<transaction-pooler-url>?pgbouncer=true&connection_limit=1
DIRECT_URL=<session-pooler-url>
```

For this project shape, `DATABASE_URL` is the pooler URL on port `6543`; `DIRECT_URL` is the session pooler URL on port `5432`.

## Run Migrations

```bash
DATABASE_URL="<transaction-pooler-url>?pgbouncer=true&connection_limit=1" \
DIRECT_URL="<session-pooler-url>" \
npm run db:generate

DATABASE_URL="<transaction-pooler-url>?pgbouncer=true&connection_limit=1" \
DIRECT_URL="<session-pooler-url>" \
npm run db:migrate
```

## Vercel Env Vars

Set these in Vercel:

```bash
DATABASE_URL=<transaction-pooler-url>?pgbouncer=true&connection_limit=1
DIRECT_URL=<session-pooler-url>
NEXT_PUBLIC_APP_URL=https://perpl-echo.vercel.app
NEXT_PUBLIC_ENABLE_WALLET_FEATURES=false
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
ONCHAIN_INDEXER_ENABLED=false
```

Redeploy Vercel after changing env vars.

## GitHub Actions Secrets

Add these repository secrets in GitHub -> Settings -> Secrets and variables -> Actions:

```bash
DATABASE_URL=<transaction-pooler-url>?pgbouncer=true&connection_limit=1
DIRECT_URL=<session-pooler-url>
PERPL_API_BASE_URL=https://app.perpl.xyz
MONAD_RPC_URL=https://rpc.monad.xyz
PERPL_CHAIN_ID=143
PERPL_CONTRACT_ADDRESSES=0x34b6552d57a35a1d042ccae1951bd1c370112a6f
SNAPSHOT_COLLECTOR_ENABLED=true
ONCHAIN_INDEXER_ENABLED=false
WORKER_ENABLED=true
BACKFILL_ON_START=false
BACKFILL_DAYS=7
BACKFILL_MIN_SNAPSHOTS=100
```

The workflow is `.github/workflows/worker.yml`. It runs every 5 minutes when GitHub scheduling allows it and can also be run manually with `workflow_dispatch`.

## Free-Tier Protection

- `worker:once` exits after one cycle.
- Backfill is disabled for scheduled runs by default.
- On-chain indexing is disabled by default.
- Duplicate snapshots are prevented by a `(marketId, timestamp)` unique constraint.
- Public APIs strip `rawJson`.
- Timeline ranges are limited to `1h`, `4h`, `24h`, or `7d`.
- 5-minute snapshots are retained for 30 days.
- Older snapshots are aggregated into hourly summaries in `MarketHourlySnapshot`.
- Raw on-chain logs are retained for 7 days only when on-chain indexing is enabled.
- Worker health warns when no successful run occurred in 15 minutes.
- Snapshot health warns when the latest snapshot is older than 10 minutes.

## Migration Checklist

1. Create Supabase project.
2. Get pooled `DATABASE_URL` and session `DIRECT_URL`.
3. Run Prisma migrations.
4. Add Vercel Supabase env vars.
5. Redeploy Vercel.
6. Add GitHub Actions secrets.
7. Manually run the worker workflow.
8. Verify `/api/health` shows a fresh snapshot.
9. Verify `/api/worker-status` shows `runnerType: github-actions`.
10. Stop and disable the VPS worker only after GitHub Actions has written fresh snapshots.

## Stop VPS Worker After GitHub Actions Works

Do not delete files. Only stop the service after verification:

```bash
systemctl list-units | grep -i perpl
sudo systemctl stop perpl-echo-worker
sudo systemctl disable perpl-echo-worker
sudo systemctl status perpl-echo-worker
```

Then wait for the next GitHub Actions run and confirm snapshot count increases.

## Neon

Neon is no longer used in production. If old Neon data is inaccessible due transfer limits, start fresh on Supabase and document that historical Neon data was not migrated.
