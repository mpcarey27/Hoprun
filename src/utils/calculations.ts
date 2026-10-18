import type {
  DistanceUnit,
  RunTypeDefinition,
  WorkoutRun,
  DayWorkload,
  WeekWorkload,
  DayOfWeek,
} from '../types/acr';

export const MILES_TO_KM = 1.609344;
export const KM_TO_MILES = 0.621371;

export const DEFAULT_RUN_TYPES: RunTypeDefinition[] = [
  { id: 'mod_workout', name: 'Mod workout', multiplier: 7.0, color: '#ef4444' }, // Red
  { id: 'easy', name: 'Easy', multiplier: 3.0, color: '#06b6d4' }, // Cyan
  { id: 'long_run', name: 'Long run', multiplier: 3.0, color: '#10b981' }, // Green
  { id: 'day_off', name: 'Day off', multiplier: 0.0, color: '#64748b' }, // Gray
  { id: 'race', name: 'Race', multiplier: 8.0, color: '#f97316' }, // Orange
  { id: 'fartlek', name: 'Fartlek', multiplier: 5.0, color: '#84cc16' }, // Lime/light green
  { id: 'double_threshold', name: 'Double Threshold', multiplier: 6.0, color: '#a855f7' }, // Purple
];

const RUN_TYPES_MAP = new Map<string, RunTypeDefinition>(
  DEFAULT_RUN_TYPES.flatMap((t) => [
    [t.id.toLowerCase(), t],
    [t.name.toLowerCase(), t],
  ])
);

export function getRunType(typeId: string): RunTypeDefinition {
  return RUN_TYPES_MAP.get(typeId.toLowerCase()) || {
    id: typeId,
    name: typeId,
    multiplier: 3.0,
    color: '#94a3b8',
  };
}

export function getRunTypeMultiplier(typeId: string): number {
  return getRunType(typeId).multiplier;
}

export function getRunTypeColor(typeId: string): string {
  return getRunType(typeId).color;
}

export function convertDistance(val: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return val;
  if (from === 'mi' && to === 'km') return val * MILES_TO_KM;
  if (from === 'km' && to === 'mi') return val * KM_TO_MILES;
  return val;
}

export function formatDistance(val: number, decimals: number = 2): string {
  return Number(val.toFixed(decimals)).toString();
}

/**
 * Canonical workload calculation: Distance in miles * multiplier.
 * Automatically converts kilometers to miles before applying Gabbett ACWR formula.
 */
export function calculateRunLoad(distance: number, unit: DistanceUnit, multiplier: number): number {
  const miles = convertDistance(distance, unit, 'mi');
  return Number((miles * multiplier).toFixed(1));
}

/**
 * Pre-indexes workouts into a Map keyed by YYYY-MM-DD for O(1) day lookups.
 * Eliminates O(N * D) filtering overhead across calendar and log views.
 */
export function groupWorkoutsByDate(workouts: WorkoutRun[]): Map<string, WorkoutRun[]> {
  const map = new Map<string, WorkoutRun[]>();
  for (const w of workouts) {
    const list = map.get(w.workoutDate) || [];
    list.push(w);
    map.set(w.workoutDate, list);
  }
  return map;
}

/**
 * Returns the start of the week date (YYYY-MM-DD) for a given date string,
 * taking into account firstDayOfWeek (0 = Sunday, 1 = Monday).
 */
export function getWeekStartDate(dateStr: string, firstDayOfWeek: DayOfWeek = 1): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const currentDay = d.getDay(); // 0 is Sun, 1 is Mon...
  
  // Calculate difference to reach firstDayOfWeek
  let diff = currentDay - firstDayOfWeek;
  if (diff < 0) {
    diff += 7;
  }
  
  d.setDate(d.getDate() - diff);
  return formatDate(d);
}

export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayName(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return DAY_NAMES[d.getDay()];
}

/**
 * Groups runs into weeks and calculates Acute Workload, Chronic Workload, and ACR.
 * Works with any number of weeks and arbitrary run inputs.
 */
export function buildWeeklyWorkloadData(
  runs: WorkoutRun[],
  firstDayOfWeek: DayOfWeek = 1,
  warningThreshold: number = 1.2
): WeekWorkload[] {
  if (runs.length === 0) return [];

  // Find min and max dates
  const sortedRuns = [...runs].sort((a, b) => a.workoutDate.localeCompare(b.workoutDate));
  const minDate = sortedRuns[0].workoutDate;
  const maxDate = sortedRuns[sortedRuns.length - 1].workoutDate;

  const firstWeekStart = getWeekStartDate(minDate, firstDayOfWeek);
  const lastWeekStart = getWeekStartDate(maxDate, firstDayOfWeek);

  // Build array of all consecutive week start dates
  const weekStarts: string[] = [];
  let curr = firstWeekStart;
  while (curr <= lastWeekStart) {
    weekStarts.push(curr);
    curr = addDays(curr, 7);
  }

  // Create lookup of runs by date
  const runsByDate = new Map<string, WorkoutRun[]>();
  for (const r of runs) {
    const list = runsByDate.get(r.workoutDate) || [];
    list.push(r);
    runsByDate.set(r.workoutDate, list);
  }

  // Build weeks
  const weeks: WeekWorkload[] = [];
  for (let wIdx = 0; wIdx < weekStarts.length; wIdx++) {
    const wStart = weekStarts[wIdx];
    const wEnd = addDays(wStart, 6);
    const days: DayWorkload[] = [];
    let weekMiles = 0;
    let weekKm = 0;
    let weekAcute = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dDate = addDays(wStart, dayOffset);
      const dayRuns = (runsByDate.get(dDate) || []).sort((a, b) => a.runOrder - b.runOrder);

      let dayMi = 0;
      let dayKm = 0;
      let dayLoad = 0;

      for (const run of dayRuns) {
        const miles = run.distanceUnit === 'mi' ? run.distance : run.distance * KM_TO_MILES;
        const km = run.distanceUnit === 'km' ? run.distance : run.distance * MILES_TO_KM;
        const mult = run.multiplier ?? getRunTypeMultiplier(run.runType);
        const load = miles * mult;

        dayMi += miles;
        dayKm += km;
        dayLoad += load;
      }

      weekMiles += dayMi;
      weekKm += dayKm;
      weekAcute += dayLoad;

      days.push({
        date: dDate,
        dayIndex: dayOffset,
        dayName: getDayName(dDate),
        runs: dayRuns,
        totalDistanceMi: Number(dayMi.toFixed(2)),
        totalDistanceKm: Number(dayKm.toFixed(2)),
        totalLoad: Number(dayLoad.toFixed(1)),
      });
    }

    weeks.push({
      weekNumber: wIdx + 1,
      startDate: wStart,
      endDate: wEnd,
      days,
      totalMiles: Number(weekMiles.toFixed(2)),
      totalKm: Number(weekKm.toFixed(2)),
      acuteWorkload: Number(weekAcute.toFixed(1)),
      chronicWorkload: null,
      acr: null,
      status: 'baseline',
    });
  }

  // Calculate Chronic Workload and ACR
  // Formula from spreadsheet:
  // Chronic(W) = (Acute(W-3) + Acute(W-2) + Acute(W-1) + Acute(W)) / 4
  // ACR(W) = Acute(W) / Chronic(W)
  for (let i = 0; i < weeks.length; i++) {
    if (i >= 3) {
      const last4Acutes = [
        weeks[i - 3].acuteWorkload,
        weeks[i - 2].acuteWorkload,
        weeks[i - 1].acuteWorkload,
        weeks[i].acuteWorkload,
      ];
      const chronic = last4Acutes.reduce((a, b) => a + b, 0) / 4.0;
      const acr = chronic > 0 ? weeks[i].acuteWorkload / chronic : 0;

      weeks[i].chronicWorkload = Number(chronic.toFixed(2));
      weeks[i].acr = Number(acr.toFixed(4));

      if (acr > warningThreshold) {
        weeks[i].status = 'warning';
      } else if (acr >= 0.8) {
        weeks[i].status = 'safe';
      } else {
        weeks[i].status = 'deload';
      }
    } else {
      weeks[i].status = 'baseline';
    }
  }

  return weeks;
}

export interface InWeekPrediction {
  daysElapsed: number; // 0..7
  completedLoad: number;
  plannedRemainingLoad: number;
  projectedTotalAcute: number;
  currentAcr: number | null; // based on completed load alone
  projectedAcr: number | null; // based on projected total
  hasAlreadyExceeded: boolean;
  isPredictedToExceed: boolean;
  baselineChronic: number | null; // previous 3 weeks average
  safeMaxLoadForWeek: number | null; // load that would keep ACR exactly at warningThreshold
  remainingSafeLoad: number | null; // safeMaxLoad - completedLoad
  message: string;
  severity: 'normal' | 'caution' | 'critical';
}

/**
 * Evaluates the current week's mid-week status and predicts whether
 * the athlete will breach the ACR threshold.
 */
export function calculateInWeekPrediction(
  currentWeek: WeekWorkload,
  allWeeks: WeekWorkload[],
  warningThreshold: number = 1.2
): InWeekPrediction {
  const currentWeekIndex = allWeeks.findIndex((w) => w.startDate === currentWeek.startDate);

  // We need at least 3 previous weeks to predict against chronic workload
  if (currentWeekIndex < 3) {
    return {
      daysElapsed: 0,
      completedLoad: currentWeek.acuteWorkload,
      plannedRemainingLoad: 0,
      projectedTotalAcute: currentWeek.acuteWorkload,
      currentAcr: null,
      projectedAcr: null,
      hasAlreadyExceeded: false,
      isPredictedToExceed: false,
      baselineChronic: null,
      safeMaxLoadForWeek: null,
      remainingSafeLoad: null,
      message: `Building initial baseline (Week ${currentWeekIndex + 1} of 4). ACR calculation begins once 4 weeks of training are logged.`,
      severity: 'normal',
    };
  }

  const prev3Acutes = [
    allWeeks[currentWeekIndex - 3].acuteWorkload,
    allWeeks[currentWeekIndex - 2].acuteWorkload,
    allWeeks[currentWeekIndex - 1].acuteWorkload,
  ];
  const prev3Sum = prev3Acutes.reduce((a, b) => a + b, 0);

  // Count completed vs planned runs in current week
  let completedLoad = 0;
  let plannedRemainingLoad = 0;
  let completedDaysCount = 0;

  const todayStr = formatDate(new Date());

  for (const day of currentWeek.days) {
    let dayHasCompleted = false;
    for (const run of day.runs) {
      const miles = run.distanceUnit === 'mi' ? run.distance : run.distance * KM_TO_MILES;
      const mult = run.multiplier ?? getRunTypeMultiplier(run.runType);
      const load = miles * mult;

      if (run.completed) {
        completedLoad += load;
        dayHasCompleted = true;
      } else {
        plannedRemainingLoad += load;
      }
    }
    if (dayHasCompleted || day.date < todayStr) {
      completedDaysCount++;
    }
  }

  // If no planned remaining workouts, extrapolate based on completed pace if week is in progress
  let projectedTotalAcute = completedLoad + plannedRemainingLoad;
  if (plannedRemainingLoad === 0 && completedDaysCount > 0 && completedDaysCount < 7) {
    // Extrapolate daily average across 7 days
    projectedTotalAcute = (completedLoad / completedDaysCount) * 7;
  }

  // Calculate current ACR based on what is already completed
  // Chronic = (prev3Sum + completedLoad) / 4
  const currentChronic = (prev3Sum + completedLoad) / 4.0;
  const currentAcr = currentChronic > 0 ? completedLoad / currentChronic : 0;

  // Calculate projected ACR
  const projectedChronic = (prev3Sum + projectedTotalAcute) / 4.0;
  const projectedAcr = projectedChronic > 0 ? projectedTotalAcute / projectedChronic : 0;

  // What is the maximum Acute load this week that satisfies:
  // Acute / ((prev3Sum + Acute) / 4) <= T
  // 4 * Acute <= T * prev3Sum + T * Acute
  // Acute * (4 - T) <= T * prev3Sum
  // Acute <= (T * prev3Sum) / (4 - T)
  let safeMaxLoadForWeek: number | null = null;
  if (warningThreshold < 4) {
    safeMaxLoadForWeek = (warningThreshold * prev3Sum) / (4 - warningThreshold);
  }

  const remainingSafeLoad =
    safeMaxLoadForWeek !== null ? Math.max(0, safeMaxLoadForWeek - completedLoad) : null;

  const hasAlreadyExceeded = currentAcr > warningThreshold;
  const isPredictedToExceed = projectedAcr > warningThreshold;

  let severity: 'normal' | 'caution' | 'critical' = 'normal';
  let message = '';

  if (hasAlreadyExceeded) {
    severity = 'critical';
    message = `CRITICAL ALERT: Your completed workload this week has ALREADY breached the ${warningThreshold} ACR threshold (${currentAcr.toFixed(2)}). Consider resting or very easy recovery for remaining days to mitigate injury risk!`;
  } else if (isPredictedToExceed) {
    severity = 'caution';
    message = `WARNING: Projected week ACR is ${projectedAcr.toFixed(2)}, which exceeds the safe ${warningThreshold} limit. You have ${remainingSafeLoad ? remainingSafeLoad.toFixed(0) : '0'} safe workload points remaining before exceeding threshold.`;
  } else {
    severity = 'normal';
    message = `Workload trajectory is in the optimal progressive overload zone (Projected ACR: ${projectedAcr.toFixed(2)}).`;
  }

  return {
    daysElapsed: completedDaysCount,
    completedLoad: Number(completedLoad.toFixed(1)),
    plannedRemainingLoad: Number(plannedRemainingLoad.toFixed(1)),
    projectedTotalAcute: Number(projectedTotalAcute.toFixed(1)),
    currentAcr: Number(currentAcr.toFixed(2)),
    projectedAcr: Number(projectedAcr.toFixed(2)),
    hasAlreadyExceeded,
    isPredictedToExceed,
    baselineChronic: Number((prev3Sum / 3.0).toFixed(1)),
    safeMaxLoadForWeek: safeMaxLoadForWeek !== null ? Number(safeMaxLoadForWeek.toFixed(1)) : null,
    remainingSafeLoad: remainingSafeLoad !== null ? Number(remainingSafeLoad.toFixed(1)) : null,
    message,
    severity,
  };
}

export interface RecurringDateOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  selectedDays: number[]; // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  intervalWeeks?: number; // 1 = every week, 2 = every 2 weeks, etc. Defaults to 1.
}

/**
 * Generates an array of YYYY-MM-DD date strings between startDate and endDate
 * that fall on the specified days of the week and repeat interval.
 */
export function generateRecurringDates(options: RecurringDateOptions): string[] {
  const { startDate, endDate, selectedDays, intervalWeeks = 1 } = options;
  if (!startDate || !endDate || selectedDays.length === 0 || endDate < startDate) {
    return [];
  }

  const results: string[] = [];
  const baseStartWeek = getWeekStartDate(startDate, 1);

  let currDateStr = startDate;
  while (currDateStr <= endDate) {
    const [y, m, d] = currDateStr.split('-').map(Number);
    const currObj = new Date(y, m - 1, d);
    const dayOfWeek = currObj.getDay();

    if (selectedDays.includes(dayOfWeek)) {
      if (intervalWeeks <= 1) {
        results.push(currDateStr);
      } else {
        const currWeekStart = getWeekStartDate(currDateStr, 1);
        const [by, bm, bd] = baseStartWeek.split('-').map(Number);
        const [cy, cm, cd] = currWeekStart.split('-').map(Number);
        const baseTime = new Date(by, bm - 1, bd).getTime();
        const currTime = new Date(cy, cm - 1, cd).getTime();
        const diffWeeks = Math.round((currTime - baseTime) / (7 * 24 * 60 * 60 * 1000));
        if (diffWeeks % intervalWeeks === 0) {
          results.push(currDateStr);
        }
      }
    }

    currDateStr = addDays(currDateStr, 1);
  }

  return results;
}

export interface MonthCalendarDay {
  date: string; // YYYY-MM-DD
  dayNumber: number; // 1..31
  isCurrentMonth: boolean;
  dayName: string; // Mon, Tue...
  dayOfWeek: number; // 0..6
}

export interface MonthCalendarWeek {
  weekStartDate: string; // YYYY-MM-DD
  weekEndDate: string; // YYYY-MM-DD
  days: MonthCalendarDay[];
}

/**
 * Builds the 7-day week rows for a given calendar month (1-indexed month: 1..12).
 * Pads with days from adjacent months so every week row has 7 days.
 */
export function getMonthCalendarWeeks(
  year: number,
  month: number, // 1..12
  firstDayOfWeek: DayOfWeek = 1
): MonthCalendarWeek[] {
  const firstOfMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstRowStart = getWeekStartDate(firstOfMonthStr, firstDayOfWeek);

  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const lastOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(totalDaysInMonth).padStart(2, '0')}`;
  const lastRowStart = getWeekStartDate(lastOfMonthStr, firstDayOfWeek);

  const weeks: MonthCalendarWeek[] = [];
  let currWeekStart = firstRowStart;

  while (currWeekStart <= lastRowStart) {
    const weekEndDate = addDays(currWeekStart, 6);
    const days: MonthCalendarDay[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const dStr = addDays(currWeekStart, offset);
      const [y, m, d] = dStr.split('-').map(Number);
      const dObj = new Date(y, m - 1, d);

      days.push({
        date: dStr,
        dayNumber: d,
        isCurrentMonth: y === year && m === month,
        dayName: getDayName(dStr),
        dayOfWeek: dObj.getDay(),
      });
    }

    weeks.push({
      weekStartDate: currWeekStart,
      weekEndDate,
      days,
    });

    currWeekStart = addDays(currWeekStart, 7);
  }

  return weeks;
}

/**
 * Converts hours, minutes, and seconds into total duration in seconds.
 */
export function timeToSeconds(hours: number = 0, minutes: number = 0, seconds: number = 0): number {
  const h = Math.max(0, Math.floor(Number(hours) || 0));
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return (h * 3600) + (m * 60) + s;
}

/**
 * Converts total seconds into { hours, minutes, seconds }.
 */
export function secondsToTime(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
  if (!totalSeconds || totalSeconds <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  const hours = Math.floor(totalSeconds / 3600);
  const rem = totalSeconds % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = Math.round(rem % 60);
  return { hours, minutes, seconds };
}

/**
 * Formats duration in seconds into running timing string:
 * e.g. 3855 -> "1:04:15", 2730 -> "45:30"
 */
export function formatDuration(totalSeconds?: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return '';
  const { hours, minutes, seconds } = secondsToTime(totalSeconds);
  const sStr = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const mStr = String(minutes).padStart(2, '0');
    return `${hours}:${mStr}:${sStr}`;
  }
  return `${minutes}:${sStr}`;
}

/**
 * Strava-style duration display string:
 * e.g. "1h 04m 15s" or "45m 30s"
 */
export function formatDurationStrava(totalSeconds?: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return '';
  const { hours, minutes, seconds } = secondsToTime(totalSeconds);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Converts pace minutes and seconds into pace seconds per unit.
 */
export function paceToSeconds(minutes: number = 0, seconds: number = 0): number {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return (m * 60) + s;
}

/**
 * Converts pace seconds into { minutes, seconds }.
 */
export function secondsToPace(paceSeconds: number): { minutes: number; seconds: number } {
  if (!paceSeconds || paceSeconds <= 0) {
    return { minutes: 0, seconds: 0 };
  }
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return { minutes, seconds };
}

/**
 * Calculates average pace (seconds per unit) from duration in seconds and distance.
 */
export function calculatePaceSeconds(durationSeconds: number, distance: number): number | null {
  if (!durationSeconds || durationSeconds <= 0 || !distance || distance <= 0) {
    return null;
  }
  return Math.round(durationSeconds / distance);
}

/**
 * Calculates duration (seconds) from pace (seconds per unit) and distance.
 */
export function calculateDurationFromPace(paceSeconds: number, distance: number): number | null {
  if (!paceSeconds || paceSeconds <= 0 || !distance || distance <= 0) {
    return null;
  }
  return Math.round(distance * paceSeconds);
}

/**
 * Formats pace in seconds per unit into "M:SS /mi" or "M:SS /km".
 */
export function formatPace(paceSeconds: number | null | undefined, unit: DistanceUnit = 'mi'): string {
  if (!paceSeconds || paceSeconds <= 0) return '';
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} /${unit}`;
}



