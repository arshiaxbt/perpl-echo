-- AlterTable
ALTER TABLE "EchoVote" ADD COLUMN "onchainTxHash" TEXT,
ADD COLUMN "onchainChainId" INTEGER,
ADD COLUMN "onchainWalletAddress" TEXT;

-- CreateIndex
CREATE INDEX "EchoVote_onchainTxHash_idx" ON "EchoVote"("onchainTxHash");
