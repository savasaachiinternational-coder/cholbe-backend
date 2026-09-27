-- CreateEnum
CREATE TYPE "CholbePrescriptionStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "signaturePath" TEXT,
ADD COLUMN     "signatureUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MedicationSchedule" ADD COLUMN     "cholbePrescriptionItemId" TEXT;

-- CreateTable
CREATE TABLE "CholbePrescription" (
    "id" TEXT NOT NULL,
    "serial" SERIAL NOT NULL,
    "rxNumber" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "CholbePrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "patientName" TEXT NOT NULL,
    "patientAge" TEXT,
    "patientSex" TEXT,
    "patientWeight" TEXT,
    "patientBloodGroup" TEXT,
    "allergies" TEXT,
    "doctorName" TEXT NOT NULL,
    "doctorDegree" TEXT,
    "doctorSpecialty" TEXT,
    "registrationNumber" TEXT,
    "chamberAddress" TEXT,
    "doctorPhone" TEXT,
    "chiefComplaints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "temperature" TEXT,
    "bloodPressure" TEXT,
    "pulse" TEXT,
    "spo2" TEXT,
    "diagnosis" TEXT,
    "investigations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "advice" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followUpDate" DATE,
    "pdfPath" TEXT,
    "pdfSize" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CholbePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CholbePrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "medicineId" TEXT,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "dose" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instruction" TEXT,

    CONSTRAINT "CholbePrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CholbePrescription_serial_key" ON "CholbePrescription"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "CholbePrescription_rxNumber_key" ON "CholbePrescription"("rxNumber");

-- CreateIndex
CREATE INDEX "CholbePrescription_doctorId_issuedAt_idx" ON "CholbePrescription"("doctorId", "issuedAt");

-- CreateIndex
CREATE INDEX "CholbePrescription_patientId_issuedAt_idx" ON "CholbePrescription"("patientId", "issuedAt");

-- CreateIndex
CREATE INDEX "CholbePrescription_appointmentId_idx" ON "CholbePrescription"("appointmentId");

-- CreateIndex
CREATE INDEX "CholbePrescriptionItem_prescriptionId_idx" ON "CholbePrescriptionItem"("prescriptionId");

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_cholbePrescriptionItemId_fkey" FOREIGN KEY ("cholbePrescriptionItemId") REFERENCES "CholbePrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CholbePrescription" ADD CONSTRAINT "CholbePrescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CholbePrescription" ADD CONSTRAINT "CholbePrescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CholbePrescription" ADD CONSTRAINT "CholbePrescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CholbePrescriptionItem" ADD CONSTRAINT "CholbePrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "CholbePrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CholbePrescriptionItem" ADD CONSTRAINT "CholbePrescriptionItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

