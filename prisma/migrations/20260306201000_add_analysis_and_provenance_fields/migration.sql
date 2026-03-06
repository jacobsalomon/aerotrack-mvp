-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Alert_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("alertType", "componentId", "createdAt", "description", "id", "resolvedAt", "severity", "status", "title") SELECT "alertType", "componentId", "createdAt", "description", "id", "resolvedAt", "severity", "status", "title" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_componentId_idx" ON "Alert"("componentId");
CREATE TABLE "new_CaptureEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileHash" TEXT,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" REAL,
    "transcription" TEXT,
    "aiExtraction" TEXT,
    "gpsLatitude" REAL,
    "gpsLongitude" REAL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaptureEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaptureSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CaptureEvidence" ("aiExtraction", "capturedAt", "createdAt", "durationSeconds", "fileHash", "fileSize", "fileUrl", "gpsLatitude", "gpsLongitude", "id", "mimeType", "sessionId", "transcription", "type") SELECT "aiExtraction", "capturedAt", "createdAt", "durationSeconds", "fileHash", "fileSize", "fileUrl", "gpsLatitude", "gpsLongitude", "id", "mimeType", "sessionId", "transcription", "type" FROM "CaptureEvidence";
DROP TABLE "CaptureEvidence";
ALTER TABLE "new_CaptureEvidence" RENAME TO "CaptureEvidence";
CREATE INDEX "CaptureEvidence_sessionId_idx" ON "CaptureEvidence"("sessionId");
CREATE TABLE "new_CaptureSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "technicianId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "componentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'capturing',
    "description" TEXT,
    "expectedSteps" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaptureSession_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaptureSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CaptureSession" ("completedAt", "componentId", "createdAt", "description", "id", "organizationId", "startedAt", "status", "technicianId", "updatedAt") SELECT "completedAt", "componentId", "createdAt", "description", "id", "organizationId", "startedAt", "status", "technicianId", "updatedAt" FROM "CaptureSession";
DROP TABLE "CaptureSession";
ALTER TABLE "new_CaptureSession" RENAME TO "CaptureSession";
CREATE INDEX "CaptureSession_technicianId_idx" ON "CaptureSession"("technicianId");
CREATE INDEX "CaptureSession_organizationId_idx" ON "CaptureSession"("organizationId");
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "extractedText" TEXT,
    "aiSummary" TEXT,
    "hash" TEXT,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("aiSummary", "componentId", "createdAt", "docType", "extractedText", "fileName", "filePath", "hash", "id", "isLegacy", "title") SELECT "aiSummary", "componentId", "createdAt", "docType", "extractedText", "fileName", "filePath", "hash", "id", "isLegacy", "title" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE INDEX "Document_componentId_idx" ON "Document"("componentId");
CREATE TABLE "new_DocumentGeneration2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confidence" REAL NOT NULL DEFAULT 0,
    "lowConfidenceFields" TEXT NOT NULL DEFAULT '[]',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT,
    "evidenceLineage" TEXT,
    "provenanceJson" TEXT,
    "verificationJson" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentGeneration2_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaptureSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentGeneration2_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Technician" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DocumentGeneration2" ("confidence", "contentJson", "createdAt", "documentType", "generatedAt", "id", "lowConfidenceFields", "reviewNotes", "reviewedAt", "reviewedById", "sessionId", "status", "verificationJson", "verifiedAt") SELECT "confidence", "contentJson", "createdAt", "documentType", "generatedAt", "id", "lowConfidenceFields", "reviewNotes", "reviewedAt", "reviewedById", "sessionId", "status", "verificationJson", "verifiedAt" FROM "DocumentGeneration2";
DROP TABLE "DocumentGeneration2";
ALTER TABLE "new_DocumentGeneration2" RENAME TO "DocumentGeneration2";
CREATE INDEX "DocumentGeneration2_sessionId_idx" ON "DocumentGeneration2"("sessionId");
CREATE INDEX "DocumentGeneration2_reviewedById_idx" ON "DocumentGeneration2"("reviewedById");
CREATE TABLE "new_Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "capturedBy" TEXT NOT NULL,
    "capturedByBadge" TEXT,
    "location" TEXT,
    "transcription" TEXT,
    "structuredData" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LifecycleEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Evidence" ("capturedAt", "capturedBy", "capturedByBadge", "createdAt", "eventId", "fileName", "filePath", "hash", "id", "location", "mimeType", "structuredData", "transcription", "type") SELECT "capturedAt", "capturedBy", "capturedByBadge", "createdAt", "eventId", "fileName", "filePath", "hash", "id", "location", "mimeType", "structuredData", "transcription", "type" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE INDEX "Evidence_eventId_idx" ON "Evidence"("eventId");
CREATE TABLE "new_Exception" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "exceptionType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,
    CONSTRAINT "Exception_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Exception" ("componentId", "description", "detectedAt", "evidence", "exceptionType", "id", "resolutionNotes", "resolvedAt", "resolvedBy", "severity", "status", "title") SELECT "componentId", "description", "detectedAt", "evidence", "exceptionType", "id", "resolutionNotes", "resolvedAt", "resolvedBy", "severity", "status", "title" FROM "Exception";
DROP TABLE "Exception";
ALTER TABLE "new_Exception" RENAME TO "Exception";
CREATE INDEX "Exception_componentId_idx" ON "Exception"("componentId");
CREATE TABLE "new_GeneratedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provenanceJson" TEXT,
    "pdfPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "signatureRef" TEXT,
    "hash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedDocument_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LifecycleEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GeneratedDocument" ("approvedAt", "approvedBy", "content", "createdAt", "docType", "eventId", "hash", "id", "pdfPath", "signatureRef", "status", "title") SELECT "approvedAt", "approvedBy", "content", "createdAt", "docType", "eventId", "hash", "id", "pdfPath", "signatureRef", "status", "title" FROM "GeneratedDocument";
DROP TABLE "GeneratedDocument";
ALTER TABLE "new_GeneratedDocument" RENAME TO "GeneratedDocument";
CREATE INDEX "GeneratedDocument_eventId_idx" ON "GeneratedDocument"("eventId");
CREATE TABLE "new_LifecycleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "facility" TEXT NOT NULL,
    "facilityType" TEXT NOT NULL,
    "facilityCert" TEXT,
    "performer" TEXT NOT NULL,
    "performerCert" TEXT,
    "description" TEXT NOT NULL,
    "hoursAtEvent" REAL,
    "cyclesAtEvent" INTEGER,
    "aircraft" TEXT,
    "operator" TEXT,
    "workOrderRef" TEXT,
    "cmmReference" TEXT,
    "notes" TEXT,
    "hash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LifecycleEvent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LifecycleEvent" ("aircraft", "cmmReference", "componentId", "createdAt", "cyclesAtEvent", "date", "description", "eventType", "facility", "facilityCert", "facilityType", "hash", "hoursAtEvent", "id", "notes", "operator", "performer", "performerCert", "workOrderRef") SELECT "aircraft", "cmmReference", "componentId", "createdAt", "cyclesAtEvent", "date", "description", "eventType", "facility", "facilityCert", "facilityType", "hash", "hoursAtEvent", "id", "notes", "operator", "performer", "performerCert", "workOrderRef" FROM "LifecycleEvent";
DROP TABLE "LifecycleEvent";
ALTER TABLE "new_LifecycleEvent" RENAME TO "LifecycleEvent";
CREATE INDEX "LifecycleEvent_componentId_idx" ON "LifecycleEvent"("componentId");
CREATE TABLE "new_PartConsumed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "serialNumber" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sourceDoc" TEXT,
    "sourceVendor" TEXT,
    CONSTRAINT "PartConsumed_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LifecycleEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PartConsumed" ("description", "eventId", "id", "partNumber", "quantity", "serialNumber", "sourceDoc", "sourceVendor") SELECT "description", "eventId", "id", "partNumber", "quantity", "serialNumber", "sourceDoc", "sourceVendor" FROM "PartConsumed";
DROP TABLE "PartConsumed";
ALTER TABLE "new_PartConsumed" RENAME TO "PartConsumed";
CREATE INDEX "PartConsumed_eventId_idx" ON "PartConsumed"("eventId");
CREATE TABLE "new_SessionAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "actionLog" TEXT NOT NULL,
    "partsIdentified" TEXT NOT NULL,
    "procedureSteps" TEXT NOT NULL,
    "anomalies" TEXT NOT NULL DEFAULT '[]',
    "audioTranscript" TEXT,
    "photoExtractions" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "verificationSource" TEXT,
    "modelUsed" TEXT NOT NULL,
    "modelsUsed" TEXT,
    "rawResponse" TEXT,
    "costEstimate" REAL,
    "processingTime" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CaptureSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SessionAnalysis" ("actionLog", "anomalies", "confidence", "costEstimate", "createdAt", "id", "modelUsed", "partsIdentified", "procedureSteps", "processingTime", "rawResponse", "sessionId") SELECT "actionLog", "anomalies", "confidence", "costEstimate", "createdAt", "id", "modelUsed", "partsIdentified", "procedureSteps", "processingTime", "rawResponse", "sessionId" FROM "SessionAnalysis";
DROP TABLE "SessionAnalysis";
ALTER TABLE "new_SessionAnalysis" RENAME TO "SessionAnalysis";
CREATE UNIQUE INDEX "SessionAnalysis_sessionId_key" ON "SessionAnalysis"("sessionId");
CREATE TABLE "new_Technician" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TECHNICIAN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "apiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Technician_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Technician" ("apiKey", "badgeNumber", "createdAt", "email", "firstName", "id", "lastName", "organizationId", "role", "status", "updatedAt") SELECT "apiKey", "badgeNumber", "createdAt", "email", "firstName", "id", "lastName", "organizationId", "role", "status", "updatedAt" FROM "Technician";
DROP TABLE "Technician";
ALTER TABLE "new_Technician" RENAME TO "Technician";
CREATE UNIQUE INDEX "Technician_email_key" ON "Technician"("email");
CREATE UNIQUE INDEX "Technician_badgeNumber_key" ON "Technician"("badgeNumber");
CREATE UNIQUE INDEX "Technician_apiKey_key" ON "Technician"("apiKey");
CREATE INDEX "Technician_organizationId_idx" ON "Technician"("organizationId");
CREATE TABLE "new_VideoAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceId" TEXT NOT NULL,
    "timestamp" REAL NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoAnnotation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "CaptureEvidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VideoAnnotation" ("confidence", "createdAt", "description", "evidenceId", "id", "rawResponse", "tag", "timestamp") SELECT "confidence", "createdAt", "description", "evidenceId", "id", "rawResponse", "tag", "timestamp" FROM "VideoAnnotation";
DROP TABLE "VideoAnnotation";
ALTER TABLE "new_VideoAnnotation" RENAME TO "VideoAnnotation";
CREATE INDEX "VideoAnnotation_evidenceId_idx" ON "VideoAnnotation"("evidenceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLogEntry_organizationId_idx" ON "AuditLogEntry"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_technicianId_idx" ON "AuditLogEntry"("technicianId");
