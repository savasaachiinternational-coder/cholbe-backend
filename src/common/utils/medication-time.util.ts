export function normalizeScheduledTime(timeStr: string): string {
  return timeStr.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function parseTimeToday(timeStr: string): Date | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
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

export function dayBounds() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}
