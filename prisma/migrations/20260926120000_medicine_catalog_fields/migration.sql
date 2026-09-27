-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "defaultDose" TEXT,
ADD COLUMN     "defaultDuration" TEXT,
ADD COLUMN     "defaultFrequency" TEXT,
ADD COLUMN     "defaultInstruction" TEXT,
ADD COLUMN     "form" TEXT,
ADD COLUMN     "infoSections" JSONB,
ADD COLUMN     "mrp" DECIMAL(10,2),
ADD COLUMN     "packSize" TEXT,
ADD COLUMN     "strength" TEXT;

-- CreateIndex
CREATE INDEX "Medicine_form_idx" ON "Medicine"("form");

