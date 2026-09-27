/**
 * Turns a doctor-written Rx line ("1 + 0 + 1", "7 days", "before breakfast")
 * into the fields a MedicationSchedule reminder needs. Uses the same slot
 * times and frequency keys as the upload-prescription flow.
 */
const MORNING = '08:00 AM';
const NOON = '02:00 PM';
const NIGHT = '08:00 PM';

export type ReminderPlan =
  | { ok: true; times: string[]; frequency: string; endDate: Date | null; mealTiming: string | null }
  | { ok: false; reason: string };

const FREQUENCY_KEY: Record<number, string> = {
  1: 'once_daily',
  2: 'twice_daily',
  3: 'three_times_daily',
  4: 'four_times_daily',
};

function timesFromFrequency(frequency: string): string[] | null {
  const f = frequency.toLowerCase();

  // "1 + 0 + 1", "1+1+1", "0-0-1"
  const pattern = f.match(/\b(\d)\s*[+\-]\s*(\d)(?:\s*[+\-]\s*(\d))?\b/);
  if (pattern) {
    const [morning, second, third] = [pattern[1], pattern[2], pattern[3]].map((n) => Number(n ?? 0));
    // Two parts means morning + night; three parts means morning + noon + night.
    const slots = pattern[3] === undefined
      ? [morning > 0 && MORNING, second > 0 && NIGHT]
      : [morning > 0 && MORNING, second > 0 && NOON, third > 0 && NIGHT];
    const times = slots.filter(Boolean) as string[];
    return times.length ? times : null;
  }

  if (/\b(four|4)\s*times|\bqid\b/.test(f)) return ['08:00 AM', '12:00 PM', '04:00 PM', NIGHT];
  if (/\b(thrice|three|3)\s*(times)?|\btds\b|\btid\b/.test(f)) return [MORNING, NOON, NIGHT];
  if (/\b(twice|two|2)\s*(times)?|\bbd\b|\bbid\b/.test(f)) return [MORNING, NIGHT];
  if (/\b(once|one|1)\s*(time)?|\bod\b|daily/.test(f)) {
    if (/night|bed/.test(f)) return [NIGHT];
    return [MORNING];
  }
  if (/night|bed\s*time|\bhs\b/.test(f)) return [NIGHT];
  if (/morning/.test(f)) return [MORNING];
  return null;
}

function endDateFromDuration(duration: string | null | undefined, start: Date): Date | null {
  const m = duration?.toLowerCase().match(/(\d+)\s*(day|week|month|year)/);
  if (!m) return null;
  const n = Number(m[1]);
  const end = new Date(start);
  if (m[2] === 'day') end.setDate(end.getDate() + n);
  if (m[2] === 'week') end.setDate(end.getDate() + n * 7);
  if (m[2] === 'month') end.setMonth(end.getMonth() + n);
  if (m[2] === 'year') end.setFullYear(end.getFullYear() + n);
  return end;
}

function mealTimingFrom(instruction: string | null | undefined): string | null {
  const i = instruction?.toLowerCase() ?? '';
  if (/before|empty stomach/.test(i)) return 'before';
  if (/after|with (meal|food)/.test(i)) return 'after';
  return null;
}

export function planReminder(
  item: { frequency: string | null; duration: string | null; instruction: string | null },
  start: Date,
): ReminderPlan {
  const frequency = item.frequency?.trim() ?? '';
  if (/as needed|when needed|if needed|\bsos\b|\bprn\b/i.test(frequency)) {
    return { ok: false, reason: 'Taken only when needed' };
  }
  const times = timesFromFrequency(frequency);
  if (!times) return { ok: false, reason: frequency ? `Could not read "${frequency}"` : 'No frequency given' };
  return {
    ok: true,
    times,
    frequency: FREQUENCY_KEY[times.length] ?? 'custom',
    endDate: endDateFromDuration(item.duration, start),
    mealTiming: mealTimingFrom(item.instruction),
  };
}
