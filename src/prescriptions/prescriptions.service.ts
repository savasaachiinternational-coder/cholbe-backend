import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { UploadsService } from '../uploads/uploads.service';
import { buildMedicineDraft } from '../common/utils/prescription-extraction.util';
import {
  CreatePrescriptionDto,
  PrescriptionMedicineDto,
  ScanPrescriptionDto,
} from './dto/prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  private parseDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  private medicineCreateData(medicines: PrescriptionMedicineDto[]) {
    return medicines.map((m) => ({
      name: m.name,
      dose: m.dose,
      instruction: m.instruction,
      mealTiming: m.mealTiming,
      frequency: m.frequency,
      times: m.times ?? [],
      startDate: this.parseDate(m.startDate),
      endDate: this.parseDate(m.endDate),
      reminderBeforeMinutes: m.reminderBeforeMinutes,
      followUpMinutes: m.followUpMinutes,
      inventoryCount: m.inventoryCount,
    }));
  }

  private draftFromMedicine(
    medicine: PrescriptionMedicineDto,
    prescription: {
      id: string;
      fileUrl: string;
      fileName: string | null;
    },
    source: string,
  ) {
    return {
      medicineName: medicine.name,
      dose: medicine.dose ?? '',
      instruction: medicine.instruction ?? 'custom',
      mealTiming: medicine.mealTiming ?? 'before',
      times: medicine.times?.length ? medicine.times : ['08:00 AM'],
      frequency: medicine.frequency ?? 'twice_daily',
      startDate: medicine.startDate ?? '',
      endDate: medicine.endDate ?? '',
      reminderEnabled: true,
      reminderBeforeMinutes: medicine.reminderBeforeMinutes ?? 30,
      followUpEnabled: true,
      followUpMinutes: medicine.followUpMinutes ?? 30,
      followUpTime: medicine.times?.[0] ?? '08:30 AM',
      refillEnabled: true,
      inventoryCount: medicine.inventoryCount ?? 10,
      refillDate: medicine.endDate ?? '',
      refillTime: medicine.times?.[medicine.times.length - 1] ?? '08:30 AM',
      caregiverName: '',
      prescriptionId: prescription.id,
      fileUrl: prescription.fileUrl,
      fileName: prescription.fileName ?? undefined,
      source,
    };
  }

  private async extractMedicinesFromUpload(
    patientId: string,
    fileUrl: string,
    fileName?: string,
  ): Promise<PrescriptionMedicineDto[]> {
    this.uploadsService.resolveUploadedPath(fileUrl);
    const hint = this.uploadsService.readUploadedTextHint(fileUrl, fileName);

    const [medicines, products, schedules] = await Promise.all([
      this.prisma.medicine.findMany({
        where: { status: 'ACTIVE' },
        select: { name: true, genericName: true },
        take: 300,
      }),
      this.prisma.vendorProduct.findMany({
        where: { isActive: true },
        select: { name: true, genericName: true },
        take: 300,
      }),
      this.prisma.medicationSchedule.findMany({
        where: { patientId, isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const catalog = [
      ...medicines,
      ...products.map((p) => ({ name: p.name, genericName: p.genericName })),
    ];

    const matchedSchedule = schedules.find((schedule) => {
      const token = schedule.medicineName.toLowerCase();
      return token.length >= 3 && hint.toLowerCase().includes(token);
    });

    const primary = buildMedicineDraft(
      hint,
      catalog,
      matchedSchedule ?? undefined,
    );

    const additional = schedules
      .filter((schedule) => schedule.id !== matchedSchedule?.id)
      .slice(0, 2)
      .map((schedule) => buildMedicineDraft(hint, catalog, schedule));

    const unique = new Map<string, PrescriptionMedicineDto>();
    [primary, ...additional].forEach((medicine) => {
      unique.set(medicine.name.toLowerCase(), medicine);
    });

    return Array.from(unique.values());
  }

  async create(patientId: string, dto: CreatePrescriptionDto) {
    if (!dto.fileUrl) {
      throw new BadRequestException('fileUrl is required');
    }

    const medicines = dto.medicines?.length
      ? dto.medicines
      : await this.extractMedicinesFromUpload(
          patientId,
          dto.fileUrl,
          dto.fileName,
        );

    return this.prisma.prescription.create({
      data: {
        patientId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        source: dto.source,
        medicines: { create: this.medicineCreateData(medicines) },
      },
      include: { medicines: true },
    });
  }

  async scan(patientId: string, dto: ScanPrescriptionDto) {
    if (!dto.fileUrl) {
      throw new BadRequestException('fileUrl is required');
    }

    const medicines = await this.extractMedicinesFromUpload(
      patientId,
      dto.fileUrl,
      dto.fileName,
    );

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        source: dto.source,
        medicines: { create: this.medicineCreateData(medicines) },
      },
      include: { medicines: true },
    });

    const primary = medicines[0];
    return {
      prescription,
      extractedCount: medicines.length,
      draft: this.draftFromMedicine(
        primary,
        prescription,
        dto.source ?? 'camera',
      ),
    };
  }

  async findAll(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: { medicines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(patientId: string, id: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id, patientId },
      include: { medicines: true },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  async getDraft(patientId: string, id: string) {
    const prescription = await this.findOne(patientId, id);
    const primary = prescription.medicines[0];
    if (!primary) {
      throw new BadRequestException('No medicines found in prescription');
    }

    return this.draftFromMedicine(
      {
        name: primary.name,
        dose: primary.dose ?? undefined,
        instruction: primary.instruction ?? undefined,
        mealTiming: primary.mealTiming ?? undefined,
        frequency: primary.frequency ?? undefined,
        times: primary.times,
        startDate: primary.startDate?.toISOString().slice(0, 10),
        endDate: primary.endDate?.toISOString().slice(0, 10),
        reminderBeforeMinutes: primary.reminderBeforeMinutes ?? undefined,
        followUpMinutes: primary.followUpMinutes ?? undefined,
        inventoryCount: primary.inventoryCount ?? undefined,
      },
      prescription,
      'saved',
    );
  }
}
