-- AlterTable: add CMM revision acknowledgement fields to CaptureSession
ALTER TABLE "CaptureSession" ADD COLUMN IF NOT EXISTS "cmmRevisionAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "CaptureSession" ADD COLUMN IF NOT EXISTS "cmmRevisionAcknowledgedById" TEXT;
