ALTER TABLE "EchoVote"
  ADD COLUMN "snapshotTimestamp" TIMESTAMP(3),
  ADD COLUMN "horizonHours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "browserId" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "actualReturnPercent" DOUBLE PRECISION,
  ADD COLUMN "actualOutcome" TEXT;

ALTER TABLE "EchoVote"
  ALTER COLUMN "voteValue" TYPE TEXT
  USING CASE
    WHEN "voteValue" = 1 THEN 'BULLISH'
    WHEN "voteValue" = -1 THEN 'BEARISH'
    ELSE 'BULLISH'
  END;

DROP INDEX IF EXISTS "EchoVote_analysisHash_idx";
CREATE INDEX "EchoVote_analysisHash_horizonHours_idx" ON "EchoVote"("analysisHash", "horizonHours");
CREATE INDEX "EchoVote_browserId_analysisHash_horizonHours_idx" ON "EchoVote"("browserId", "analysisHash", "horizonHours");
CREATE INDEX "EchoVote_walletAddress_analysisHash_horizonHours_idx" ON "EchoVote"("walletAddress", "analysisHash", "horizonHours");
