CREATE TABLE "MarketHourlySnapshot" (
  "id" TEXT NOT NULL,
  "marketId" INTEGER NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "openPrice" DOUBLE PRECISION NOT NULL,
  "highPrice" DOUBLE PRECISION NOT NULL,
  "lowPrice" DOUBLE PRECISION NOT NULL,
  "closePrice" DOUBLE PRECISION NOT NULL,
  "averagePrice" DOUBLE PRECISION NOT NULL,
  "averageFundingRate" DOUBLE PRECISION NOT NULL,
  "averageFundingApr" DOUBLE PRECISION NOT NULL,
  "totalVolume" DOUBLE PRECISION NOT NULL,
  "averageOpenInterest" DOUBLE PRECISION,
  "averageSpread" DOUBLE PRECISION,
  "averageVolatility" DOUBLE PRECISION NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "regimeCountsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketHourlySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketHourlySnapshot_marketId_timestamp_key"
  ON "MarketHourlySnapshot"("marketId", "timestamp");

CREATE INDEX "MarketHourlySnapshot_marketId_timestamp_idx"
  ON "MarketHourlySnapshot"("marketId", "timestamp");

ALTER TABLE "MarketHourlySnapshot"
  ADD CONSTRAINT "MarketHourlySnapshot_marketId_fkey"
  FOREIGN KEY ("marketId") REFERENCES "Market"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
