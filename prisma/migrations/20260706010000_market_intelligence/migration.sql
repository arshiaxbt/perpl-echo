ALTER TABLE "MarketSnapshot"
  ADD COLUMN "regime" TEXT,
  ADD COLUMN "regimeConfidence" DOUBLE PRECISION,
  ADD COLUMN "regimeReasonsJson" JSONB;

CREATE TABLE "OnchainIntelligenceSnapshot" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "windowMinutes" INTEGER NOT NULL,
  "recentEventCount" INTEGER NOT NULL,
  "uniqueWalletCount" INTEGER,
  "newWalletCount" INTEGER,
  "returningWalletCount" INTEGER,
  "activeWalletDelta" INTEGER,
  "estimatedLargeTradeCount" INTEGER,
  "whaleActivityScore" DOUBLE PRECISION,
  "walletConcentrationScore" DOUBLE PRECISION,
  "largestWalletDominance" DOUBLE PRECISION,
  "eventVelocity" DOUBLE PRECISION,
  "liquidationEventCount" INTEGER,
  "positionChangeEventCount" INTEGER,
  "unknownEventCount" INTEGER,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnchainIntelligenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnchainIntelligenceSnapshot_marketId_blockNumber_windowMinutes_key"
  ON "OnchainIntelligenceSnapshot"("marketId", "blockNumber", "windowMinutes");

CREATE INDEX "OnchainIntelligenceSnapshot_marketId_timestamp_idx"
  ON "OnchainIntelligenceSnapshot"("marketId", "timestamp");

CREATE INDEX "OnchainIntelligenceSnapshot_windowMinutes_timestamp_idx"
  ON "OnchainIntelligenceSnapshot"("windowMinutes", "timestamp");

ALTER TABLE "OnchainIntelligenceSnapshot"
  ADD CONSTRAINT "OnchainIntelligenceSnapshot_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
