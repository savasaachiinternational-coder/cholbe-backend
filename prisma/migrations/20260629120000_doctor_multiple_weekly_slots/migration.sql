-- Drop unique constraint so a doctor can have multiple time blocks per day
DROP INDEX IF EXISTS "DoctorWeeklyAvailability_doctorId_dayOfWeek_key";

-- AlterTable
ALTER TABLE "DoctorWeeklyAvailability" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DoctorWeeklyAvailability" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "DoctorWeeklyAvailability_doctorId_dayOfWeek_idx" ON "DoctorWeeklyAvailability"("doctorId", "dayOfWeek");
