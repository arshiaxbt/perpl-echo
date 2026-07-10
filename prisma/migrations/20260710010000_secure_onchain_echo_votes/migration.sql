-- Prevent transaction reuse and concurrent duplicate votes from the same Privy user.
DROP INDEX IF EXISTS "EchoVote_onchainTxHash_idx";
CREATE UNIQUE INDEX "EchoVote_onchainTxHash_key" ON "EchoVote"("onchainTxHash");
DROP INDEX IF EXISTS "EchoVote_privyUserId_analysisHash_horizonHours_idx";
CREATE UNIQUE INDEX "EchoVote_privyUserId_analysisHash_horizonHours_key"
ON "EchoVote"("privyUserId", "analysisHash", "horizonHours");
