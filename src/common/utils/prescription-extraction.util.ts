import { PrescriptionMedicineDto } from '../../prescriptions/dto/prescription.dto';

type CatalogEntry = {
  name: string;
  genericName: string | null;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+]/g, ' ');
}

function parseDosePattern(hint: string): string | null {
  const match = hint.match(/\b(\d+\+\d+(?:\+\d+)?)\b/);
  return match?.[1] ?? null;
}

function timesFromDosePattern(pattern: string | null): string[] {
  if (!pattern) return ['08:00 AM', '08:30 PM'];
  const parts = pattern.split('+').map((n) => Number(n.trim()));
  const slots: string[] = [];
  if (parts[0] > 0) slots.push('08:00 AM');
  if (parts[1] > 0) slots.push('02:00 PM');
  if (parts[2] > 0) slots.push('08:00 PM');
  if (!slots.length) return ['08:00 AM'];
  return slots;
}

function frequencyFromTimes(times: string[]) {
  if (times.length >= 3) return 'three_times_daily';
  if (times.length === 2) return 'twice_daily';
  return 'once_daily';
}

function matchCatalogEntry(hint: string, catalog: CatalogEntry[]) {
  const normalizedHint = normalizeText(hint);
  let best: { entry: CatalogEntry; score: number } | null = null;

  for (const entry of catalog) {
    const candidates = [entry.name, entry.genericName].filter(Boolean) as string[];
    for (const candidate of candidates) {
      const token = normalizeText(candidate);
      if (!token || token.length < 3) continue;
      if (normalizedHint.includes(token)) {
        const score = token.length;
        if (!best || score > best.score) {
          best = { entry, score };
        }
      }
    }
  }

  return best?.entry ?? null;
}

export function buildMedicineDraft(
  hint: string,
  catalog: CatalogEntry[],
  schedule?: {
    medicineName: string;
    dose: string | null;
    instruction: string | null;
    mealTiming: string | null;
    frequency: string | null;
    times: string[];
    startDate: Date | null;
    endDate: Date | null;
    reminderBeforeMinutes: number | null;
    followUpMinutes: number | null;
    inventoryCount: number | null;
  },
): PrescriptionMedicineDto {
  const start = schedule?.startDate ?? new Date();
  const end = schedule?.endDate ?? new Date(start.getTime());
  if (!schedule?.endDate) {
    end.setMonth(end.getMonth() + 1);
  }

  const dosePattern = parseDosePattern(hint);
  const times = schedule?.times.length
    ? schedule.times
    : timesFromDosePattern(dosePattern);
  const matched = matchCatalogEntry(hint, catalog);
  const name = schedule?.medicineName ?? matched?.name ?? 'Prescribed Medicine';
  const dose =
    schedule?.dose ??
    dosePattern ??
    (matched?.name.match(/\d+\s*mg/i)?.[0]
      ? `1 ${matched.name.match(/\d+\s*mg/i)![0]}`
      : '1 tablet');

  return {
    name,
    dose,
    instruction: schedule?.instruction ?? 'custom',
    mealTiming: schedule?.mealTiming ?? 'before',
    frequency: schedule?.frequency ?? frequencyFromTimes(times),
    times,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    reminderBeforeMinutes: schedule?.reminderBeforeMinutes ?? 30,
    followUpMinutes: schedule?.followUpMinutes ?? 30,
    inventoryCount: schedule?.inventoryCount ?? 10,
  };
}
