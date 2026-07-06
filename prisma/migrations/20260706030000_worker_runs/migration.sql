CREATE TABLE "WorkerRun" (
  "id" TEXT NOT NULL,
  "workerName" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "message" TEXT,
  "statsJson" JSONB,
  CONSTRAINT "WorkerRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkerRun_workerName_startedAt_idx"
  ON "WorkerRun"("workerName", "startedAt");

CREATE INDEX "WorkerRun_status_startedAt_idx"
  ON "WorkerRun"("status", "startedAt");
