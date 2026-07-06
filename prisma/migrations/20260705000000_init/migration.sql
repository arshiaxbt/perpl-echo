CREATE TABLE "Market" (
  "id" INTEGER NOT NULL,
  "symbol" TEXT NOT NULL,
  "baseAsset" TEXT NOT NULL,
  "quoteAsset" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "name" TEXT,
  "priceDecimals" INTEGER NOT NULL DEFAULT 0,
  "sizeDecimals" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketSnapshot" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "indexPrice" DOUBLE PRECISION,
  "fundingRate" DOUBLE PRECISION NOT NULL,
  "fundingApr" DOUBLE PRECISION NOT NULL,
  "volume" DOUBLE PRECISION NOT NULL,
  "openInterest" DOUBLE PRECISION,
  "spread" DOUBLE PRECISION,
  "orderbookImbalance" DOUBLE PRECISION,
  "volatility" DOUBLE PRECISION NOT NULL,
  "return1hBefore" DOUBLE PRECISION NOT NULL,
  "return4hBefore" DOUBLE PRECISION NOT NULL,
  "return24hBefore" DOUBLE PRECISION NOT NULL,
  "volumeChange" DOUBLE PRECISION NOT NULL,
  "trendScore" DOUBLE PRECISION NOT NULL,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimilaritySearch" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentSnapshotId" TEXT,
  "resultsJson" JSONB NOT NULL,
  CONSTRAINT "SimilaritySearch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectorRun" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "message" TEXT,
  "snapshotsSaved" INTEGER NOT NULL DEFAULT 0,
  "marketsChecked" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CollectorRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Market_symbol_key" ON "Market"("symbol");
CREATE UNIQUE INDEX "MarketSnapshot_marketId_timestamp_key" ON "MarketSnapshot"("marketId", "timestamp");
CREATE INDEX "MarketSnapshot_marketId_timestamp_idx" ON "MarketSnapshot"("marketId", "timestamp");
CREATE INDEX "SimilaritySearch_marketId_createdAt_idx" ON "SimilaritySearch"("marketId", "createdAt");

ALTER TABLE "MarketSnapshot"
  ADD CONSTRAINT "MarketSnapshot_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SimilaritySearch"
  ADD CONSTRAINT "SimilaritySearch_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
