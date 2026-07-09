-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "privyUserId" TEXT NOT NULL,
    "twitterSubject" TEXT,
    "twitterUsername" TEXT,
    "twitterName" TEXT,
    "twitterImageUrl" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EchoVote" ADD COLUMN "profileId" TEXT,
ADD COLUMN "privyUserId" TEXT,
ADD COLUMN "twitterUsername" TEXT,
ADD COLUMN "twitterName" TEXT,
ADD COLUMN "twitterImageUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_privyUserId_key" ON "UserProfile"("privyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_twitterSubject_key" ON "UserProfile"("twitterSubject");

-- CreateIndex
CREATE INDEX "UserProfile_twitterUsername_idx" ON "UserProfile"("twitterUsername");

-- CreateIndex
CREATE INDEX "EchoVote_profileId_createdAt_idx" ON "EchoVote"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "EchoVote_privyUserId_analysisHash_horizonHours_idx" ON "EchoVote"("privyUserId", "analysisHash", "horizonHours");

-- AddForeignKey
ALTER TABLE "EchoVote" ADD CONSTRAINT "EchoVote_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
