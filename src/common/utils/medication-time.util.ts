import { endOfDayBd, startOfDayBd, toDateOnlyIsoBd } from './bd-time.util';

/** A dose not taken this long after its time (or after a snooze ends) is marked missed. */
export const MISSED_AFTER_MINUTES = 30;
/** A dose can be marked taken from this many minutes before it is due. */
export const TAKE_WINDOW_MINUTES = 30;

export function normalizeScheduledTime(timeStr: string): string {
  return timeStr.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * The instant a dose time ("08:00 AM") falls on, on the given Bangladesh
 * calendar day (today by default). Dose times are BD wall-clock times, so this
 * must not depend on the server's timezone.
 */
export function parseTimeToday(timeStr: string, dateIso: string = toDateOnlyIsoBd()): Date | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${dateIso}T${pad(hours)}:${pad(minutes)}:00+06:00`);
}

export function minutesUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000));
}

type TodayLog = {
  status: string;
  scheduledTime: string | null;
  loggedAt: Date;
  snoozeUntil?: Date | null;
};

export function isSlotTakenToday(
  logs: TodayLog[],
  scheduledTime: string,
  dueAt: Date,
): boolean {
  const normalized = normalizeScheduledTime(scheduledTime);
  return logs.some((log) => {
    if (log.status !== 'taken') return false;
    if (log.scheduledTime) {
      return normalizeScheduledTime(log.scheduledTime) === normalized;
    }
    return Math.abs(log.loggedAt.getTime() - dueAt.getTime()) < 3600000;
  });
}

export function isSlotSnoozed(logs: TodayLog[], scheduledTime: string): Date | null {
  const normalized = normalizeScheduledTime(scheduledTime);
  const snooze = logs.find((log) => {
    if (log.status !== 'snoozed' || !log.snoozeUntil) return false;
    if (log.scheduledTime) {
      return normalizeScheduledTime(log.scheduledTime) === normalized;
    }
    return log.snoozeUntil.getTime() > Date.now();
  });
  if (!snooze?.snoozeUntil || snooze.snoozeUntil.getTime() <= Date.now()) {
    return null;
  }
  return snooze.snoozeUntil;
}

/** Today's bounds in Bangladesh time — the day dose logs are grouped by. */
export function dayBounds(now: Date = new Date()) {
  return { startOfDay: startOfDayBd(now), endOfDay: endOfDayBd(now) };
}

/**
 * Doses per slot for today, where a later "taken" overrides an automatic
 * "missed" (the patient took it late). Returns the slots counted as missed.
 */
export function countMissedSlots(logs: { status: string; scheduledTime: string | null; scheduleId: string }[]): number {
  const bySlot = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.scheduledTime) continue;
    const key = `${log.scheduleId}|${normalizeScheduledTime(log.scheduledTime)}`;
    const statuses = bySlot.get(key) ?? new Set<string>();
    statuses.add(log.status);
    bySlot.set(key, statuses);
  }
  let missed = 0;
  bySlot.forEach((statuses) => {
    if (statuses.has('missed') && !statuses.has('taken')) missed++;
  });
  return missed;
}
