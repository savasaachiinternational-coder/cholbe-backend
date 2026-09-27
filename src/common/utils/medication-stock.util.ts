/** Days of supply left at or below which the patient gets a low-stock alert. */
export const LOW_STOCK_DAYS = 3;
/** Never alert later than this many units left, even for once-a-week medicines. */
const MIN_LOW_STOCK_UNITS = 3;

// Doses written as a count of these units use up that many from stock; any
// other dose ("10 mL", "Apply a thin layer") uses up one unit.
const COUNTED_UNIT = /^(\d+)\s*(tab|tablet|tablets|cap|capsule|capsules|pill|pills|pc|pcs|piece|pieces|sachet|sachets|puff|puffs)\b/i;

/** Units taken out of stock for one dose, e.g. "2 tablets" → 2, "10 mL" → 1. */
export function unitsPerDose(dose: string | null | undefined): number {
  const match = dose?.trim().match(COUNTED_UNIT);
  const units = match ? parseInt(match[1], 10) : 1;
  return units > 0 ? units : 1;
}

type StockSchedule = { dose: string | null; times: string[] };

/** Units used per day: doses per day × units per dose. */
export function dailyUnits(schedule: StockSchedule): number {
  return Math.max(1, schedule.times.length) * unitsPerDose(schedule.dose);
}

/** Stock level at which the low-stock alert fires. */
export function lowStockThreshold(schedule: StockSchedule): number {
  return Math.max(MIN_LOW_STOCK_UNITS, dailyUnits(schedule) * LOW_STOCK_DAYS);
}

/** Whole days the remaining stock lasts. */
export function daysOfStock(schedule: StockSchedule & { inventoryCount: number }): number {
  return Math.floor(schedule.inventoryCount / dailyUnits(schedule));
}
