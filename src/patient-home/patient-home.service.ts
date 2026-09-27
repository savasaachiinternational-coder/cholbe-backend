import { Injectable, NotFoundException } from '@nestjs/common';
import {
  pickNextUpcomingAppointment,
  startOfDayBd,
} from '../common/utils/bd-time.util';
import { PrismaService } from '../prisma/prisma.module';
import {
  isSlotSnoozed,
  isSlotTakenToday,
  countMissedSlots,
  dayBounds,
  minutesUntil,
  parseTimeToday,
  TAKE_WINDOW_MINUTES,
} from '../common/utils/medication-time.util';
import { daysOfStock, lowStockThreshold } from '../common/utils/medication-stock.util';

@Injectable()
export class PatientHomeService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: { include: { familyMembers: true } },
        addresses: { where: { isDefault: true }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const { startOfDay, endOfDay } = dayBounds();

    const [
      schedules,
      todayLogs,
      vitals,
      unreadNotifications,
      relatedProducts,
      nextAppointment,
    ] = await Promise.all([
      this.prisma.medicationSchedule.findMany({
        where: { patientId: userId, isActive: true },
        include: { logs: { where: { loggedAt: { gte: startOfDay, lte: endOfDay } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.medicationLog.findMany({
        where: {
          loggedAt: { gte: startOfDay, lte: endOfDay },
          schedule: { patientId: userId },
        },
      }),
      this.prisma.healthVital.findMany({
        where: { patientId: userId },
        orderBy: { recordedAt: 'desc' },
        take: 5,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.vendorProduct.findMany({
        where: { isActive: true },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appointment
        .findMany({
          where: {
            patientId: userId,
            status: { in: ['scheduled', 'confirmed', 'in_progress'] },
            scheduledDate: { gte: startOfDayBd(new Date()) },
          },
          include: {
            doctor: { include: { user: { select: { fullName: true } } } },
          },
        })
        .then((rows) => pickNextUpcomingAppointment(rows)),
    ]);

    const taken = todayLogs.filter((l) => l.status === 'taken').length;
    const missed = countMissedSlots(todayLogs);
    const totalDosesToday = schedules.reduce((sum, s) => sum + (s.times.length || 1), 0);
    const remaining = Math.max(0, totalDosesToday - taken);

    const nextMed = this.computeNextMedication(schedules);
    const bp = vitals.find((v) => v.vitalType === 'blood_pressure');
    const oxygen = vitals.find((v) => v.vitalType === 'oxygen');

    const address = user.addresses[0];
    const locationLabel = address?.region ?? address?.formattedAddress?.split(',')[0] ?? 'Add address';

    return {
      user: {
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        location: locationLabel,
        lastActiveLabel: this.formatLastActive(user.updatedAt),
      },
      nextMedication: nextMed,
      allDosesTakenToday: schedules.length > 0 && !nextMed,
      medicationStats: { taken, missed, remaining, total: totalDosesToday },
      healthVitals: {
        bloodPressure: bp
          ? { value: bp.value, checkedAgo: this.formatAgo(bp.recordedAt) }
          : null,
        oxygen: oxygen
          ? { value: oxygen.value, checkedAgo: this.formatAgo(oxygen.recordedAt) }
          : null,
      },
      refill: {
        ...this.soonestRefill(schedules),
        familyMonitoring: (user.patientProfile?.familyMembers.length ?? 0) > 0,
      },
      schedules: schedules.map((s) => ({
        id: s.id,
        medicineName: s.medicineName,
        dose: s.dose,
        times: s.times,
        mealTiming: s.mealTiming,
        instruction: s.instruction,
        todayLogs: s.logs.map((log) => ({
          status: log.status,
          scheduledTime: log.scheduledTime,
          loggedAt: log.loggedAt,
        })),
      })),
      relatedProducts: relatedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        genericName: p.genericName,
        unitPrice: p.unitPrice,
        discountPrice: p.discountPrice,
        imageUrl: p.imageUrl,
        category: p.category,
      })),
      nextAppointment: nextAppointment
        ? {
            id: nextAppointment.id,
            doctorName: nextAppointment.doctor.user.fullName,
            specialty: nextAppointment.doctor.specialty,
            scheduledDate: nextAppointment.scheduledDate,
            timeSlot: nextAppointment.timeSlot,
          }
        : null,
      unreadNotifications,
    };
  }

  private computeNextMedication(
    schedules: Array<{
      id: string;
      medicineName: string;
      dose: string | null;
      times: string[];
      logs: Array<{
        status: string;
        scheduledTime: string | null;
        loggedAt: Date;
        snoozeUntil?: Date | null;
      }>;
    }>,
  ) {
    if (!schedules.length) return null;

    let best: {
      scheduleId: string;
      medicineName: string;
      dose: string | null;
      scheduledTime: string;
      dueAt: Date;
      minutesUntil: number;
    } | null = null;

    for (const schedule of schedules) {
      const times = schedule.times.length ? schedule.times : ['08:00 AM'];
      for (const t of times) {
        const dueAt = parseTimeToday(t);
        if (!dueAt) continue;
        if (isSlotTakenToday(schedule.logs, t, dueAt)) continue;

        const snoozeUntil = isSlotSnoozed(schedule.logs, t);
        const effectiveDueAt = snoozeUntil ?? dueAt;
        const mins = minutesUntil(effectiveDueAt);

        if (!best || effectiveDueAt.getTime() < best.dueAt.getTime()) {
          best = {
            scheduleId: schedule.id,
            medicineName: schedule.medicineName,
            dose: schedule.dose,
            scheduledTime: t,
            dueAt: effectiveDueAt,
            minutesUntil: mins,
          };
        }
      }
    }

    if (!best) return null;

    return {
      scheduleId: best.scheduleId,
      medicineName: best.medicineName,
      dose: best.dose,
      scheduledTime: best.scheduledTime,
      canMarkTaken: best.minutesUntil <= TAKE_WINDOW_MINUTES,
      /** When the dose (or its snooze) is due; lets the app tick the label itself. */
      dueAt: best.dueAt.toISOString(),
      minutesUntil: best.minutesUntil,
      minutesUntilLabel:
        best.minutesUntil <= 0
          ? 'Due now'
          : best.minutesUntil < 60
            ? `In ${best.minutesUntil} Minutes`
            : `In ${Math.floor(best.minutesUntil / 60)}h ${best.minutesUntil % 60}m`,
    };
  }

  /** The tracked medicine that runs out first; nulls when none has stock tracking on. */
  private soonestRefill(
    schedules: Array<{
      medicineName: string;
      dose: string | null;
      times: string[];
      refillEnabled: boolean;
      inventoryCount: number | null;
    }>,
  ) {
    let soonest: { medicineName: string; daysUntil: number; unitsLeft: number; lowStock: boolean } | null =
      null;
    for (const s of schedules) {
      if (!s.refillEnabled || s.inventoryCount === null) continue;
      const tracked = { ...s, inventoryCount: s.inventoryCount };
      const days = daysOfStock(tracked);
      if (!soonest || days < soonest.daysUntil) {
        soonest = {
          medicineName: s.medicineName,
          daysUntil: days,
          unitsLeft: s.inventoryCount,
          lowStock: s.inventoryCount <= lowStockThreshold(s),
        };
      }
    }
    return {
      daysUntil: soonest?.daysUntil ?? null,
      medicineName: soonest?.medicineName ?? null,
      unitsLeft: soonest?.unitsLeft ?? null,
      lowStock: soonest?.lowStock ?? false,
    };
  }

  private formatAgo(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  private formatLastActive(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days < 7) return `${days || 1} days ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
}
