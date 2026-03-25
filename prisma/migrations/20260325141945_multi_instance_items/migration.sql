-- Multi-instance items: support items that repeat N times (e.g., 15 springs)
-- Adds instanceCount and instanceLabels to InspectionItem,
-- instanceIndex to InspectionProgress and Measurement,
-- and updates the unique constraint to include instanceIndex.

-- DropIndex (old constraint: one progress per item per session)
DROP INDEX "InspectionProgress_captureSessionId_inspectionItemId_key";

-- AlterTable: add multi-instance fields to InspectionItem
ALTER TABLE "InspectionItem" ADD COLUMN "instanceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "instanceLabels" TEXT[];

-- AlterTable: add instanceIndex to InspectionProgress
ALTER TABLE "InspectionProgress" ADD COLUMN "instanceIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: add instanceIndex to Measurement
ALTER TABLE "Measurement" ADD COLUMN "instanceIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: new constraint includes instanceIndex (one progress per item-instance per session)
CREATE UNIQUE INDEX "InspectionProgress_captureSessionId_inspectionItemId_instan_key" ON "InspectionProgress"("captureSessionId", "inspectionItemId", "instanceIndex");
