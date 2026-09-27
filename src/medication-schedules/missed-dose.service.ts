import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { toDateOnlyIsoBd } from '../common/utils/bd-time.util';
import {
  MISSED_AFTER_MINUTES,
  dayBounds,
  isSlotTakenToday,
  normalizeScheduledTime,
  parseTimeToday,
} from '../common/utils/medication-time.util';

const CHECK_EVERY_MS = 60_000;
/** Misses older than this (e.g. found after downtime) are recorded quietly, without alerts. */
const NOTIFY_WITHIN_MS = 2 * 60 * 60_000;
/** Arbitrary constant key for the Postgres advisory lock that keeps one runner at a time. */
const LOCK_KEY = 732_190_415;

export type MissedDose = {
  patientId: string;
  patientName: string;
  scheduleId: string;
  medicineName: string;
  dose: string | null;
  scheduledTime: string;
  notify: boolean;
};

/**
 * Marks a dose as missed when it hasn't been taken {@link MISSED_AFTER_MINUTES}
 * minutes after its time (or after the end of a snooze), then tells the patient
 * and their family. The patient can still mark it taken later — a later
 * "taken" log wins over the automatic "missed".
 */
@Injectable()
export class MissedDoseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MissedDoseService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  onModuleInit() {
    if (process.env.MISSED_DOSE_JOB === 'off') return;
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const missed = await this.markMissedDoses();
      if (missed.length) this.logger.log(`Marked ${missed.length} dose(s) as missed`);
    } catch (e) {
      this.logger.error('Missed-dose check failed', e instanceof Error ? e.stack : String(e));
    } finally {
      this.running = false;
    }
  }

  async markMissedDoses(now: Date = new Date()): Promise<MissedDose[]> {
    const missed = await this.prisma.$transaction(
      async (tx) => {
        // Transaction-scoped lock: only one process marks doses at a time, and
        // it is released automatically when the transaction ends.
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
        if (!locked) return [];

        const todayIso = toDateOnlyIsoBd(now);
        const { startOfDay, endOfDay } = dayBounds(now);
        const schedules = await tx.medicationSchedule.findMany({
          where: {
            isActive: true,
            NOT: { times: { isEmpty: true } },
            AND: [
              { OR: [{ startDate: null }, { startDate: { lte: endOfDay } }] },
              { OR: [{ endDate: null }, { endDate: { gte: startOfDay } }] },
            ],
          },
          include: {
            patient: { select: { id: true, fullName: true } },
            logs: { where: { loggedAt: { gte: startOfDay, lte: endOfDay } } },
          },
        });

        const found: MissedDose[] = [];
        for (const schedule of schedules) {
          for (const time of schedule.times) {
            const dueAt = parseTimeToday(time, todayIso);
            // Unreadable time, or the dose was due before this schedule existed.
            if (!dueAt || dueAt < schedule.createdAt) continue;

            const slot = normalizeScheduledTime(time);
            const slotLogs = schedule.logs.filter(
              (log) => log.scheduledTime && normalizeScheduledTime(log.scheduledTime) === slot,
            );
            if (isSlotTakenToday(schedule.logs, time, dueAt)) continue;
            if (slotLogs.some((log) => log.status === 'missed')) continue;

            // A snooze moves the dose; the grace period starts when it ends.
            const snoozedUntil = slotLogs
              .filter((log) => log.status === 'snoozed' && log.snoozeUntil)
              .reduce((latest, log) => Math.max(latest, log.snoozeUntil!.getTime()), dueAt.getTime());
            const missedAt = snoozedUntil + MISSED_AFTER_MINUTES * 60_000;
            if (now.getTime() < missedAt) continue;

            await tx.medicationLog.create({
              data: { scheduleId: schedule.id, status: 'missed', scheduledTime: slot, loggedAt: now },
            });
            found.push({
              patientId: schedule.patient.id,
              patientName: schedule.patient.fullName,
              scheduleId: schedule.id,
              medicineName: schedule.medicineName,
              dose: schedule.dose,
              scheduledTime: slot,
              notify: now.getTime() - missedAt <= NOTIFY_WITHIN_MS,
            });
          }
        }
        return found;
      },
      { timeout: 50_000 },
    );

    await Promise.all(missed.filter((m) => m.notify).map((m) => this.notify(m)));
    return missed;
  }

  /**
   * Everyone linked to the patient as family who has an account: the guardian
   * managing them, the family members they added, and anyone who added them
   * as a family member.
   */
  async familyOf(patientId: string): Promise<string[]> {
    const [profile, listedBy] = await Promise.all([
      this.prisma.patientProfile.findUnique({
        where: { userId: patientId },
        select: { managedByUserId: true, familyMembers: { select: { memberUserId: true } } },
      }),
      this.prisma.familyMember.findMany({
        where: { memberUserId: patientId },
        select: { patient: { select: { userId: true } } },
      }),
    ]);
    const ids = new Set<string>();
    if (profile?.managedByUserId) ids.add(profile.managedByUserId);
    profile?.familyMembers.forEach((m) => m.memberUserId && ids.add(m.memberUserId));
    listedBy.forEach((m) => ids.add(m.patient.userId));
    ids.delete(patientId);
    return [...ids];
  }

  private async notify(dose: MissedDose) {
    const medicine = dose.dose ? `${dose.medicineName} (${dose.dose})` : dose.medicineName;
    const title = `Missed dose: ${dose.medicineName}`;
    const data = {
      type: 'missed_dose',
      patientId: dose.patientId,
      scheduleId: dose.scheduleId,
      scheduledTime: dose.scheduledTime,
    };

    const family = await this.familyOf(dose.patientId);
    const familyBody = `${dose.patientName} missed ${medicine} scheduled at ${dose.scheduledTime}.`;
    const patientBody = `You missed ${medicine} scheduled at ${dose.scheduledTime}. If you already took it, mark it as taken.`;

    await Promise.all([
      this.notifications.create(dose.patientId, 'alert', title, patientBody),
      ...family.map((id) => this.notifications.create(id, 'alert', title, familyBody)),
    ]);
    await Promise.all([
      this.push.sendToUsers([dose.patientId], { title, body: patientBody, data }),
      family.length ? this.push.sendToUsers(family, { title, body: familyBody, data }) : Promise.resolve(),
    ]).catch((e) => this.logger.warn(`Push failed for missed dose: ${e instanceof Error ? e.message : e}`));
  }
}
