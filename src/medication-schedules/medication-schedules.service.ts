import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MedicationSchedule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { MissedDoseService } from './missed-dose.service';
import { lowStockThreshold, unitsPerDose } from '../common/utils/medication-stock.util';
import { CreateMedicationScheduleDto } from './dto/medication-schedule.dto';
import { UpdateMedicationScheduleDto } from './dto/update-medication-schedule.dto';
import {
  TAKE_WINDOW_MINUTES,
  dayBounds,
  isSlotTakenToday,
  normalizeScheduledTime,
  parseTimeToday,
} from '../common/utils/medication-time.util';

@Injectable()
export class MedicationSchedulesService {
  private readonly logger = new Logger(MedicationSchedulesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private push: PushService,
    private missedDoses: MissedDoseService,
  ) {}

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
      if (Date.now() < dueAt.getTime() - TAKE_WINDOW_MINUTES * 60_000) {
        throw new BadRequestException(
          `You can mark this dose as taken from ${TAKE_WINDOW_MINUTES} minutes before ${resolvedTime}.`,
        );
      }
    }

    const snoozeUntil =
      status === 'snoozed'
        ? new Date(Date.now() + snoozeMinutes * 60000)
        : undefined;

    const logData = {
      scheduleId,
      status,
      scheduledTime: resolvedTime ? normalizeScheduledTime(resolvedTime) : undefined,
      snoozeUntil,
    };

    if (status !== 'taken' || schedule.inventoryCount === null) {
      return this.prisma.medicationLog.create({ data: logData });
    }

    // A taken dose uses up stock. The decrement is atomic, then clamped at 0.
    const used = unitsPerDose(schedule.dose);
    const { log, before, after } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.medicationLog.create({ data: logData });
      const { inventoryCount } = await tx.medicationSchedule.update({
        where: { id: scheduleId },
        data: { inventoryCount: { decrement: used } },
        select: { inventoryCount: true },
      });
      const remaining = Math.max(0, inventoryCount ?? 0);
      if (remaining !== inventoryCount) {
        await tx.medicationSchedule.update({
          where: { id: scheduleId },
          data: { inventoryCount: remaining },
        });
      }
      return { log: created, before: (inventoryCount ?? 0) + used, after: remaining };
    });

    // Alerting must never fail the dose log itself.
    await this.alertIfStockLow(schedule, before, after).catch((e) =>
      this.logger.warn(`Low-stock alert failed: ${e instanceof Error ? e.message : e}`),
    );
    return log;
  }

  /**
   * Tells the patient and their family once when stock drops to a few days'
   * supply, and once more when it runs out — only at the dose that crosses the
   * line, so later doses don't repeat the alert. Respects the refill toggle.
   */
  private async alertIfStockLow(schedule: MedicationSchedule, before: number, after: number) {
    if (!schedule.refillEnabled) return;
    const threshold = lowStockThreshold(schedule);
    const ranOut = after === 0 && before > 0;
    const becameLow = after <= threshold && before > threshold;
    if (!ranOut && !becameLow) return;

    const patient = await this.prisma.user.findUnique({
      where: { id: schedule.patientId },
      select: { fullName: true },
    });
    const name = schedule.medicineName;
    const left = `${after} left`;
    const title = ranOut ? `Out of stock: ${name}` : `Running low: ${name}`;
    const patientBody = ranOut
      ? `You have run out of ${name}. Order a refill so you don't miss a dose.`
      : `Only ${left} of ${name}. Order a refill soon.`;
    const familyBody = ranOut
      ? `${patient?.fullName ?? 'Your family member'} has run out of ${name}.`
      : `${patient?.fullName ?? 'Your family member'} has only ${left} of ${name}.`;
    const data = { type: 'low_stock', scheduleId: schedule.id, unitsLeft: String(after) };

    const family = await this.missedDoses.familyOf(schedule.patientId);
    await Promise.all([
      this.notifications.create(schedule.patientId, 'alert', title, patientBody),
      ...family.map((id) => this.notifications.create(id, 'alert', title, familyBody)),
    ]);
    await Promise.all([
      this.push.sendToUsers([schedule.patientId], { title, body: patientBody, data }),
      family.length
        ? this.push.sendToUsers(family, { title, body: familyBody, data })
        : Promise.resolve(),
    ]);
  }

  async update(patientId: string, scheduleId: string, dto: UpdateMedicationScheduleDto) {
    const schedule = await this.prisma.medicationSchedule.findFirst({
      where: { id: scheduleId, patientId },
    });
    if (!schedule) throw new NotFoundException('Medication schedule not found');
    // Only fields the client sent are changed; dates arrive as YYYY-MM-DD strings.
    return this.prisma.medicationSchedule.update({
      where: { id: scheduleId },
      data: {
        medicineName: dto.medicineName,
        dose: dto.dose,
        instruction: dto.instruction,
        mealTiming: dto.mealTiming,
        times: dto.times,
        frequency: dto.frequency,
        startDate: this.parseDate(dto.startDate),
        endDate: this.parseDate(dto.endDate),
        reminderEnabled: dto.reminderEnabled,
        reminderBeforeMinutes: dto.reminderBeforeMinutes,
        followUpEnabled: dto.followUpEnabled,
        followUpMinutes: dto.followUpMinutes,
        followUpTime: dto.followUpTime,
        refillEnabled: dto.refillEnabled,
        inventoryCount: dto.inventoryCount,
        refillDate: this.parseDate(dto.refillDate),
        refillTime: dto.refillTime,
        caregiverName: dto.caregiverName,
        isActive: dto.isActive,
      },
    });
  }
}
