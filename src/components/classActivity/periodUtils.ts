import { format } from 'date-fns';

// Every granularity the Class Activity page offers boils down to the same
// thing: an inclusive [from, to] range of "YYYY-MM" month buckets, since
// that's how the Worker's D1 table is keyed. Quarter/half-year/year/last-
// 12-months are all just different ways of picking that range - there's
// no separate backend concept for any of them.
export type Granularity =
  | 'month'
  | 'quarter'
  | 'halfYear'
  | 'year'
  | 'trailing12';

export interface Period {
  granularity: Granularity;
  // For 'month': the picked month. For 'quarter'/'halfYear'/'year': the
  // picked year. Unused for 'trailing12'. Kept around so the picker can
  // restore its own controls when re-rendered with a given Period.
  year: number;
  // 1-4 for quarter, 1-2 for halfYear. Unused otherwise.
  segment: number;
  from: string;
  to: string;
  label: string;
}

// Earliest year the picker offers - the backward-walking historical
// backfill stops on its own once real Skirmish history runs out, but the
// UI needs a fixed lower bound for its year dropdown independent of that.
// Confirmed Skirmish data exists at least back to January 2024; picking an
// earlier year just means a range that comes back with monthsWithData: []
// and the page's usual "not tracked" messaging, not a crash.
export const EARLIEST_YEAR = 2024;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const monthKey = (year: number, month: number): string =>
  `${year}-${pad2(month)}`;

export const parseMonthKey = (key: string): { year: number; month: number } => {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
};

const monthLabel = (key: string): string => {
  const { year, month } = parseMonthKey(key);
  return format(new Date(year, month - 1, 1), 'MMMM yyyy');
};

// Subtracts (count - 1) months from a "YYYY-MM" key, e.g. 11 months back
// from 2026-08 gives 2025-09 - used for the trailing-12-months window.
const monthsBack = (key: string, count: number): string => {
  const { year, month } = parseMonthKey(key);
  const zeroBased = year * 12 + (month - 1) - count;
  return monthKey(Math.floor(zeroBased / 12), (zeroBased % 12) + 1);
};

export const availableYears = (currentYear: number): number[] => {
  const years: number[] = [];
  for (let y = currentYear; y >= EARLIEST_YEAR; y -= 1) {
    years.push(y);
  }
  return years;
};

const clampToCurrentMonth = (
  candidate: string,
  currentMonth: string,
): string => (candidate > currentMonth ? currentMonth : candidate);

export const buildMonthPeriod = (month: string): Period => ({
  granularity: 'month',
  year: parseMonthKey(month).year,
  segment: parseMonthKey(month).month,
  from: month,
  to: month,
  label: monthLabel(month),
});

export const buildQuarterPeriod = (
  year: number,
  quarter: number,
  currentMonth: string,
): Period => {
  const startMonth = (quarter - 1) * 3 + 1;
  const from = monthKey(year, startMonth);
  const to = clampToCurrentMonth(monthKey(year, startMonth + 2), currentMonth);
  return {
    granularity: 'quarter',
    year,
    segment: quarter,
    from,
    to,
    label: `Q${quarter} ${year}`,
  };
};

export const buildHalfYearPeriod = (
  year: number,
  half: number,
  currentMonth: string,
): Period => {
  const startMonth = half === 1 ? 1 : 7;
  const from = monthKey(year, startMonth);
  const to = clampToCurrentMonth(monthKey(year, startMonth + 5), currentMonth);
  return {
    granularity: 'halfYear',
    year,
    segment: half,
    from,
    to,
    label: `H${half} ${year}`,
  };
};

export const buildYearPeriod = (year: number, currentMonth: string): Period => {
  const from = monthKey(year, 1);
  const to = clampToCurrentMonth(monthKey(year, 12), currentMonth);
  return {
    granularity: 'year',
    year,
    segment: 0,
    from,
    to,
    label: String(year),
  };
};

// "Last 12 months" is an approximation, not exact-365-days precision -
// worth being upfront about, since the Worker only tracks first-seen-per-
// calendar-month, not per-day activity. Labeling it "Last 12 Months"
// (trailing full calendar months) rather than "Last 365 Days" avoids
// promising day-level precision the data can't actually back up.
export const buildTrailing12Period = (currentMonth: string): Period => {
  const from = monthsBack(currentMonth, 11);
  return {
    granularity: 'trailing12',
    year: parseMonthKey(currentMonth).year,
    segment: 0,
    from,
    to: currentMonth,
    label: 'Last 12 Months',
  };
};

export const defaultPeriod = (currentMonth: string): Period =>
  buildMonthPeriod(currentMonth);

// The trailing N calendar-month keys ending at (and including) the given
// month, oldest first - e.g. trailingMonthKeys('2026-08', 12) gives
// ['2025-09', '2025-10', ..., '2026-08']. Used by the Trend tab, which
// needs each individual month's data rather than one summed range.
export const trailingMonthKeys = (endMonth: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    monthsBack(endMonth, count - 1 - index),
  );

export const monthLabelForKey = monthLabel;
