CREATE TABLE "OnchainBlockCursor" (
  "id" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "contractAddress" TEXT NOT NULL,
  "lastProcessedBlock" BIGINT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnchainBlockCursor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnchainEvent" (
  "id" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "blockHash" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "contractAddress" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "marketSymbol" TEXT,
  "trader" TEXT,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnchainEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnchainMarketSnapshot" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "txCount" INTEGER NOT NULL,
  "tradeCount" INTEGER,
  "liquidationCount" INTEGER,
  "largeTradeCount" INTEGER,
  "activeWalletCount" INTEGER,
  "whaleFlowScore" DOUBLE PRECISION,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnchainMarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnchainBlockCursor_chainId_contractAddress_key"
  ON "OnchainBlockCursor"("chainId", "contractAddress");

CREATE UNIQUE INDEX "OnchainEvent_chainId_txHash_logIndex_key"
  ON "OnchainEvent"("chainId", "txHash", "logIndex");

CREATE INDEX "OnchainEvent_chainId_blockNumber_idx"
  ON "OnchainEvent"("chainId", "blockNumber");

CREATE INDEX "OnchainEvent_marketSymbol_blockNumber_idx"
  ON "OnchainEvent"("marketSymbol", "blockNumber");

CREATE UNIQUE INDEX "OnchainMarketSnapshot_marketId_blockNumber_key"
  ON "OnchainMarketSnapshot"("marketId", "blockNumber");

CREATE INDEX "OnchainMarketSnapshot_marketId_timestamp_idx"
  ON "OnchainMarketSnapshot"("marketId", "timestamp");

ALTER TABLE "OnchainMarketSnapshot"
  ADD CONSTRAINT "OnchainMarketSnapshot_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
