ALTER TABLE "MarketSnapshot"
  ADD COLUMN "clusterId" TEXT;

CREATE TABLE "MarketStateCluster" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER,
  "clusterKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "regime" TEXT NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "averageDurationMinutes" DOUBLE PRECISION,
  "averageReturn1h" DOUBLE PRECISION,
  "averageReturn4h" DOUBLE PRECISION,
  "averageReturn24h" DOUBLE PRECISION,
  "fundingNormalizationRate" DOUBLE PRECISION,
  "transitionJson" JSONB,
  "centroidJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketStateCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketStateTransition" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER,
  "fromClusterId" TEXT NOT NULL,
  "toClusterId" TEXT NOT NULL,
  "transitionCount" INTEGER NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL,
  "averageMinutesToTransition" DOUBLE PRECISION,
  "averageReturnDuringTransition" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EchoVote" (
  "id" TEXT NOT NULL,
  "analysisHash" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "walletAddress" TEXT,
  "voteValue" INTEGER NOT NULL,
  "signature" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EchoVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketStateCluster_clusterKey_key" ON "MarketStateCluster"("clusterKey");
CREATE INDEX "MarketStateCluster_marketId_regime_idx" ON "MarketStateCluster"("marketId", "regime");
CREATE UNIQUE INDEX "MarketStateTransition_marketId_fromClusterId_toClusterId_key" ON "MarketStateTransition"("marketId", "fromClusterId", "toClusterId");
CREATE INDEX "MarketStateTransition_marketId_fromClusterId_idx" ON "MarketStateTransition"("marketId", "fromClusterId");
CREATE INDEX "EchoVote_analysisHash_idx" ON "EchoVote"("analysisHash");
CREATE INDEX "EchoVote_symbol_createdAt_idx" ON "EchoVote"("symbol", "createdAt");
CREATE INDEX "MarketSnapshot_clusterId_idx" ON "MarketSnapshot"("clusterId");

ALTER TABLE "MarketSnapshot"
  ADD CONSTRAINT "MarketSnapshot_clusterId_fkey"
  FOREIGN KEY ("clusterId") REFERENCES "MarketStateCluster"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketStateCluster"
  ADD CONSTRAINT "MarketStateCluster_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketStateTransition"
  ADD CONSTRAINT "MarketStateTransition_fromClusterId_fkey"
  FOREIGN KEY ("fromClusterId") REFERENCES "MarketStateCluster"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketStateTransition"
  ADD CONSTRAINT "MarketStateTransition_toClusterId_fkey"
  FOREIGN KEY ("toClusterId") REFERENCES "MarketStateCluster"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
