import { parseTimeToMinutes } from './availability.util';

/** Bangladesh Standard Time — used for all appointment & consultation scheduling. */
export const BD_TIMEZONE = 'Asia/Dhaka';

export const ACTIVE_APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
] as const;

/** Calendar date (YYYY-MM-DD) in Bangladesh. */
export function toDateOnlyIsoBd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BD_TIMEZONE }).format(date);
}

/** Stored appointment day marker (always noon UTC on the BD calendar date). */
export function parseAppointmentDateOnly(dateIso: string): Date {
  const dateOnly = dateIso.slice(0, 10);
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

export function todayAppointmentDateBd(): Date {
  return parseAppointmentDateOnly(toDateOnlyIsoBd());
}

/** e.g. "5:12 PM" — Bangladesh local wall-clock label for a time slot. */
export function formatTimeSlotBd(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BD_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Sunday = 0 … Saturday = 6 in Bangladesh. */
export function dayOfWeekBd(date: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: BD_TIMEZONE,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function startOfDayBd(date: Date): Date {
  const iso = toDateOnlyIsoBd(date);
  return new Date(`${iso}T00:00:00+06:00`);
}

export function endOfDayBd(date: Date): Date {
  const iso = toDateOnlyIsoBd(date);
  return new Date(`${iso}T23:59:59.999+06:00`);
}

/** Combine stored appointment date + BD time-slot label into an absolute instant. */
export function appointmentStartsAtBd(scheduledDate: Date, timeSlot: string): Date {
  const dateIso = toDateOnlyIsoBd(scheduledDate);
  const totalMinutes = parseTimeToMinutes(timeSlot);
  if (Number.isNaN(totalMinutes)) {
    return parseAppointmentDateOnly(dateIso);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  const [year, month, day] = dateIso.split('-');
  return new Date(
    `${year}-${month}-${day}T${pad(hours)}:${pad(minutes)}:00+06:00`,
  );
}

export function appointmentEndsAtBd(
  scheduledDate: Date,
  timeSlot: string,
  durationMin = 30,
): Date {
  const start = appointmentStartsAtBd(scheduledDate, timeSlot);
  return new Date(start.getTime() + durationMin * 60 * 1000);
}

export function isActiveAppointmentStatus(status: string): boolean {
  return (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

/** True while the appointment window has not ended yet (BD time). */
export function isAppointmentUpcoming(
  scheduledDate: Date,
  timeSlot: string,
  status: string,
  durationMin = 30,
): boolean {
  if (!isActiveAppointmentStatus(status)) return false;
  return appointmentEndsAtBd(scheduledDate, timeSlot, durationMin).getTime() > Date.now();
}

/** True during join window: grace period before slot through end of slot (BD time). */
export function isAppointmentJoinableNow(
  scheduledDate: Date,
  timeSlot: string,
  durationMin = 30,
  graceMinutes = 15,
): boolean {
  const start = appointmentStartsAtBd(scheduledDate, timeSlot);
  const graceStart = new Date(start.getTime() - graceMinutes * 60 * 1000);
  const end = appointmentEndsAtBd(scheduledDate, timeSlot, durationMin);
  const now = Date.now();
  return now >= graceStart.getTime() && now <= end.getTime();
}

export function formatAppointmentDateBd(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BD_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function pickNextUpcomingAppointment<
  T extends {
    scheduledDate: Date;
    timeSlot: string;
    status: string;
    durationMin?: number | null;
  },
>(appointments: T[]): T | null {
  return (
    appointments
      .filter((appt) =>
        isAppointmentUpcoming(
          appt.scheduledDate,
          appt.timeSlot,
          appt.status,
          appt.durationMin ?? 30,
        ),
      )
      .sort(
        (a, b) =>
          appointmentStartsAtBd(a.scheduledDate, a.timeSlot).getTime() -
          appointmentStartsAtBd(b.scheduledDate, b.timeSlot).getTime(),
      )[0] ?? null
  );
}

/** Live-call helper: BD time slot ~2 minutes ago. */
export function liveCallTimeSlotBd(minutesAgo = 2): string {
  const when = new Date(Date.now() - minutesAgo * 60 * 1000);
  return formatTimeSlotBd(when);
}
