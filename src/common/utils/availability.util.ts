import {
  endOfDayBd,
  startOfDayBd,
  toDateOnlyIsoBd,
} from './bd-time.util';

export function parseTimeToMinutes(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return NaN;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (!meridiem && hours >= 24) return NaN;
  return hours * 60 + minutes;
}

export function formatMinutesToSlot(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
}

export function generateTimeSlots(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return [];
  const slots: string[] = [];
  for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
    slots.push(formatMinutesToSlot(t));
  }
  return slots;
}

export function startOfDay(date: Date): Date {
  return startOfDayBd(date);
}

export function endOfDay(date: Date): Date {
  return endOfDayBd(date);
}

export function toDateOnlyIso(date: Date): string {
  return toDateOnlyIsoBd(date);
}
