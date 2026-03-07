CREATE TABLE "SessionProcessingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'queued',
    "userFacingState" TEXT NOT NULL DEFAULT 'Captured',
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "lastError" TEXT,
    "lastErrorStage" TEXT,
    "runnerToken" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionProcessingJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaptureSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SessionProcessingStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "lastError" TEXT,
    "errorMetadata" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionProcessingStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SessionProcessingJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SessionPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'evidence_bundle_manifest',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "manifestJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionPackage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaptureSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionProcessingJob_sessionId_key" ON "SessionProcessingJob"("sessionId");
CREATE INDEX "SessionProcessingJob_currentStage_idx" ON "SessionProcessingJob"("currentStage");
CREATE UNIQUE INDEX "SessionProcessingStage_jobId_stage_key" ON "SessionProcessingStage"("jobId", "stage");
CREATE INDEX "SessionProcessingStage_status_idx" ON "SessionProcessingStage"("status");
CREATE UNIQUE INDEX "SessionPackage_sessionId_key" ON "SessionPackage"("sessionId");
