# Perpl Echo

Perpl Echo collects public Perpl market snapshots and asks:

> Have we seen a market state like this before, and what happened afterward?

It is a Next.js and Prisma app with a separate always-on worker. The web app reads from Postgres and serves the UI/API routes. The worker fills Postgres by collecting Perpl public market data, indexing optional Monad logs, generating on-chain intelligence snapshots, assigning clusters, and updating market transition probabilities.

This project uses public market data and optional public RPC data only. It does not use private keys, trading endpoints, paid APIs, AI APIs, custody, approvals, or token transfers.

## Architecture

```text
Browser
  -> Vercel Next.js web app
     -> API routes
     -> external Postgres

Railway/Fly/Render/VPS worker
  -> Perpl public API
  -> Monad public RPC
  -> external Postgres

Local Docker Compose
  -> postgres service
  -> web service
  -> worker service
  -> nginx service
```

The Vercel web target does not run worker loops and does not depend on Docker or Docker network hostnames. The worker target runs separately as a long-lived Node process. The database target is any normal hosted PostgreSQL database such as Supabase, Neon, Railway Postgres, or a managed VPS Postgres.

## Features

- Next.js 15, TypeScript, Tailwind, shadcn-style UI primitives, Recharts
- PostgreSQL with Prisma models for markets, snapshots, regimes, clusters, transitions, votes, on-chain logs, intelligence snapshots, collector runs, and worker runs
- Public Perpl REST snapshot collector
- Optional Monad on-chain log indexer with per-contract block cursors
- Deterministic regime classification, clustering, and market evolution transitions
- Echo Engine scoring for historical state similarity
- Market pages, timeline replay, state graph, bookmarks, votes, and status views
- Health endpoints at `/api/health` and `/api/worker-status`
- Data Quality Engine that hides rarity, confidence, regime statistics, and outcomes until the history is deep enough
- Optional candle backfill for price, volume, volatility, and return history

## Local Development

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run worker:once
npm run dev
```

Open `http://localhost:3000`.

Run the continuous worker in another terminal:

```bash
npm run worker
```

Run the full local Docker stack:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost/api/health
curl http://localhost/api/worker-status
```

## Scripts

- `npm run dev`: local Next.js dev server
- `npm run build`: Vercel-compatible production build
- `npm run start`: Next.js production server
- `npm run worker`: always-on worker loop
- `npm run worker:once`: one full worker cycle, then exit
- `npm run backfill`: candle-based historical backfill for price/volume/return context
- `npm run db:migrate`: production-safe Prisma migration deploy
- `npm run db:generate`: generate Prisma client
- `npm run db:studio`: Prisma Studio
- `npm run typecheck`: generate Prisma client and run TypeScript checks
- `npm run lint`: ESLint

## Environment Files

- `.env.example`: local full-stack Docker development
- `.env.vercel.example`: Vercel web target
- `.env.worker.example`: Railway/Fly/Render/VPS worker target

Do not use Docker-only hostnames such as `postgres` in Vercel or hosted workers. Use the external Postgres connection string from Supabase, Neon, Railway Postgres, or your VPS database.

## Railway Worker

`railway.json` pins the Railway start command to:

```bash
npm run worker
```

Railway should run only the worker target. It should not run `npm run start` or serve the Next.js web app. Set `WORKER_NAME=perpl-echo-railway-worker` on Railway so `/api/worker-status` can distinguish Railway runs from any old VPS runs.

## Data Quality Rules

Perpl Echo intentionally hides evidence metrics until there is enough data:

- Rarity and market memory require at least 24 hours of history and 100 snapshots.
- Echo confidence requires at least 100 historical snapshots and 10 matches with forward outcomes.
- Same-regime statistics require at least 30 same-regime snapshots.
- Average outcomes and top historical echoes require forward outcome windows to exist.

When a metric is hidden, APIs and pages return the reason, usually `Collecting historical data` or `Insufficient sample size`.

## Backfill Limits

`npm run backfill` uses Perpl candle history where available. Candle backfill can improve price, volume, volatility, and future-return coverage. It does not reconstruct exact historical funding, open interest, orderbook imbalance, or on-chain context. Backfilled rows are marked internally so funding-based similarity does not treat reconstructed funding as exact history.

Set `BACKFILL_ON_START=true` on the worker if you want a guarded startup backfill when the database has fewer than `BACKFILL_MIN_SNAPSHOTS` snapshots.

## On-chain Status States

The on-chain layer reports one of:

- `disabled`: indexer intentionally disabled.
- `not_configured`: RPC URL or contract addresses are missing.
- `offline`: configured RPC is not reachable.
- `syncing`: RPC works but no cursor exists yet or the cursor is behind.
- `healthy`: RPC works and the cursor is near the current block.

## Deployment

Use [DEPLOYMENT.md](/root/perpl-market-state-search/DEPLOYMENT.md) for the full 0-to-100 production guide.

Recommended production split:

```text
GitHub repo
  -> Vercel web app
  -> Railway worker
  -> Supabase or Neon Postgres
```

Alternative split:

```text
GitHub repo
  -> Vercel web app
  -> VPS worker
  -> Supabase or Neon Postgres
```

Production migration commands:

```bash
npm install
npm run db:generate
npm run db:migrate
```

Use `prisma migrate deploy` in production through `npm run db:migrate`. Do not use `prisma migrate dev` against production databases.

## Not Financial Advice

Perpl Echo is an analytics and historical market-state research tool. It is not financial advice, investment advice, trading advice, or a prediction service. Historical similarity does not imply future performance.
