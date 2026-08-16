import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { CreateMedicationScheduleDto } from './dto/medication-schedule.dto';
import {
  dayBounds,
  isSlotTakenToday,
  normalizeScheduledTime,
  parseTimeToday,
} from '../common/utils/medication-time.util';

@Injectable()
export class MedicationSchedulesService {
  constructor(private prisma: PrismaService) {}

  private parseDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  create(patientId: string, dto: CreateMedicationScheduleDto) {
    return this.prisma.medicationSchedule.create({
      data: {
        patientId,
        medicineName: dto.medicineName,
        dose: dto.dose,
        instruction: dto.instruction,
        mealTiming: dto.mealTiming,
        times: dto.times ?? [],
        frequency: dto.frequency,
        startDate: this.parseDate(dto.startDate),
        endDate: this.parseDate(dto.endDate),
        reminderEnabled: dto.reminderEnabled ?? true,
        reminderBeforeMinutes: dto.reminderBeforeMinutes,
        followUpEnabled: dto.followUpEnabled ?? false,
        followUpMinutes: dto.followUpMinutes,
        followUpTime: dto.followUpTime,
        refillEnabled: dto.refillEnabled ?? false,
        inventoryCount: dto.inventoryCount,
        refillDate: this.parseDate(dto.refillDate),
        refillTime: dto.refillTime,
        caregiverName: dto.caregiverName,
        prescriptionId: dto.prescriptionId,
      },
    });
  }

  findAll(patientId: string) {
    return this.prisma.medicationSchedule.findMany({
      where: { patientId, isActive: true },
      include: { logs: { orderBy: { loggedAt: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async logDose(
    patientId: string,
    scheduleId: string,
    status: 'taken' | 'missed' | 'snoozed',
    snoozeMinutes = 10,
    scheduledTime?: string,
  ) {
    const schedule = await this.prisma.medicationSchedule.findFirst({
      where: { id: scheduleId, patientId },
    });
    if (!schedule) throw new NotFoundException('Medication schedule not found');

    const { startOfDay, endOfDay } = dayBounds();
    const todayLogs = await this.prisma.medicationLog.findMany({
      where: {
        scheduleId,
        loggedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const resolvedTime =
      scheduledTime?.trim() ||
      (schedule.times.length === 1 ? schedule.times[0] : undefined);

    if (status === 'taken') {
      if (!resolvedTime) {
        throw new BadRequestException(
          'scheduledTime is required when logging a dose',
        );
      }
      const dueAt = parseTimeToday(resolvedTime);
      if (!dueAt) {
        throw new BadRequestException('Invalid scheduled time');
      }
      if (isSlotTakenToday(todayLogs, resolvedTime, dueAt)) {
        throw new BadRequestException(
          'This dose has already been marked as taken today',
        );
      }
    }

    const snoozeUntil =
      status === 'snoozed'
        ? new Date(Date.now() + snoozeMinutes * 60000)
        : undefined;

    return this.prisma.medicationLog.create({
      data: {
        scheduleId,
        status,
        scheduledTime: resolvedTime
          ? normalizeScheduledTime(resolvedTime)
          : undefined,
        snoozeUntil,
      },
    });
  }

  async update(patientId: string, scheduleId: string, data: { isActive?: boolean }) {
    const schedule = await this.prisma.medicationSchedule.findFirst({
      where: { id: scheduleId, patientId },
    });
    if (!schedule) throw new NotFoundException('Medication schedule not found');
    return this.prisma.medicationSchedule.update({
      where: { id: scheduleId },
      data,
    });
  }
}
