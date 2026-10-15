import { describe, it, expect } from 'vitest';
import {
  calculateRunLoad,
  convertDistance,
  calculateInWeekPrediction,
  buildWeeklyWorkloadData,
  generateRecurringDates,
} from '../src/utils/calculations';
import type { WorkoutRun, WeekWorkload } from '../src/types/acr';

describe('ACWR Calculations (TDD Core Science)', () => {
  it('test_calculateRunLoad_multipliers() - exact workload values', () => {
    // 5.0 miles of easy (3.0) -> 15.0
    expect(calculateRunLoad(5.0, 'mi', 3.0)).toBe(15.0);
    // 4.0 miles of mod_workout (7.0) -> 28.0
    expect(calculateRunLoad(4.0, 'mi', 7.0)).toBe(28.0);
    // 10.0 miles of long_run (3.0) -> 30.0
    expect(calculateRunLoad(10.0, 'mi', 3.0)).toBe(30.0);
    // 3.1 miles of race (8.0) -> 24.8
    expect(calculateRunLoad(3.1, 'mi', 8.0)).toBe(24.8);
    // any distance on day_off (0.0) -> 0.0
    expect(calculateRunLoad(10.0, 'mi', 0.0)).toBe(0.0);
  });

  it('test_calculateRunLoad_km_conversion() - converts km before multiplier', () => {
    // 10.0 km of easy (3.0) -> (10.0 / 1.609344) * 3.0 ≈ 18.64 -> rounded to 18.6
    const load = calculateRunLoad(10.0, 'km', 3.0);
    expect(load).toBeCloseTo(18.6, 1);
  });

  it('test_convertDistance_precision() - roundtrip precision', () => {
    expect(convertDistance(10, 'mi', 'mi')).toBe(10);
    expect(convertDistance(1, 'mi', 'km')).toBe(1.609344);
    expect(convertDistance(1.609344, 'km', 'mi')).toBeCloseTo(1.0, 5);
    expect(convertDistance(0, 'mi', 'km')).toBe(0);
  });

  it('test_inWeekPrediction_safeMaxLoad() - Gabbett safe threshold algebra', () => {
    // Week with 3 previous weeks of 100 acute each (Prev3Sum = 300)
    // Asafe = (1.20 * 300) / 2.80 ≈ 128.57
    const mockWeeks: WeekWorkload[] = [
      { weekNumber: 1, startDate: '2026-09-21', endDate: '2026-09-27', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      { weekNumber: 2, startDate: '2026-09-28', endDate: '2026-10-04', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      { weekNumber: 3, startDate: '2026-10-05', endDate: '2026-10-11', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      { weekNumber: 4, startDate: '2026-10-12', endDate: '2026-10-18', days: [], totalMiles: 10, totalKm: 16, acuteWorkload: 50, chronicWorkload: null, acr: null, status: 'baseline' },
    ];
    const currentWeek = mockWeeks[3];
    const prediction = calculateInWeekPrediction(currentWeek, mockWeeks, 1.20);
    expect(prediction.safeMaxLoadForWeek).toBeCloseTo(128.57, 1);
  });

  it('test_inWeekPrediction_remainingBudget_clamping() - non-negative remaining budget', () => {
    const mockWeeks: WeekWorkload[] = [
      { weekNumber: 1, startDate: '2026-09-21', endDate: '2026-09-27', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      { weekNumber: 2, startDate: '2026-09-28', endDate: '2026-10-04', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      { weekNumber: 3, startDate: '2026-10-05', endDate: '2026-10-11', days: [], totalMiles: 30, totalKm: 48, acuteWorkload: 100, chronicWorkload: null, acr: null, status: 'baseline' },
      {
        weekNumber: 4,
        startDate: '2026-10-12',
        endDate: '2026-10-18',
        days: [
          {
            date: '2026-10-12',
            dayIndex: 0,
            dayName: 'Mon',
            runs: [
              {
                id: 'r1',
                workoutDate: '2026-10-12',
                runOrder: 1,
                distance: 50,
                distanceUnit: 'mi',
                runType: 'easy',
                multiplier: 3,
                load: 150,
                comments: '',
                completed: true,
              },
            ],
            totalDistanceMi: 50,
            totalDistanceKm: 80,
            totalLoad: 150,
          },
        ],
        totalMiles: 50,
        totalKm: 80,
        acuteWorkload: 150,
        chronicWorkload: null,
        acr: null,
        status: 'baseline',
      },
    ];
    const prediction = calculateInWeekPrediction(mockWeeks[3], mockWeeks, 1.20);
    expect(prediction.remainingSafeLoad).toBe(0);
    expect(prediction.hasAlreadyExceeded).toBe(true);
  });

  it('test_chronicWorkload_4WeekWindow() - 4-week moving average', () => {
    const runs: WorkoutRun[] = [
      { id: '1', workoutDate: '2026-09-21', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true },
      { id: '2', workoutDate: '2026-09-28', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true },
      { id: '3', workoutDate: '2026-10-05', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true },
      { id: '4', workoutDate: '2026-10-12', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true },
    ];
    const weeks = buildWeeklyWorkloadData(runs, 1, 1.20);
    expect(weeks.length).toBe(4);
    expect(weeks[0].chronicWorkload).toBeNull();
    expect(weeks[1].chronicWorkload).toBeNull();
    expect(weeks[2].chronicWorkload).toBeNull();
    expect(weeks[3].chronicWorkload).toBe(30.0);
    expect(weeks[3].acr).toBe(1.0);
    expect(weeks[3].status).toBe('safe');
  });
});

describe('Coach Assign Run - Recurring Dates Generator (TDD)', () => {
  it('test_generateRecurringDates_mon_wed() - assigns Mondays and Wednesdays from 10/12/2026 to 12/31/2026', () => {
    // 10/12/2026 is Monday (day 1), 12/31/2026 is Thursday (day 4)
    // Selected days: Monday (1) and Wednesday (3)
    const dates = generateRecurringDates({
      startDate: '2026-10-12',
      endDate: '2026-12-31',
      selectedDays: [1, 3], // Mon, Wed
      intervalWeeks: 1,
    });

    // Verify first and last date
    expect(dates[0]).toBe('2026-10-12'); // First Monday
    expect(dates[1]).toBe('2026-10-14'); // First Wednesday
    expect(dates[dates.length - 1]).toBe('2026-12-30'); // Last Wednesday before 12/31

    // 12 weeks: 12 Mondays + 12 Wednesdays = 24 runs
    expect(dates.length).toBe(24);

    // Verify all generated dates are indeed either Monday or Wednesday
    for (const d of dates) {
      const [year, month, day] = d.split('-').map(Number);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      expect([1, 3]).toContain(dayOfWeek);
    }
  });

  it('test_generateRecurringDates_single_day() - assigns each Monday', () => {
    const dates = generateRecurringDates({
      startDate: '2026-10-12',
      endDate: '2026-11-02',
      selectedDays: [1], // Monday only
      intervalWeeks: 1,
    });

    expect(dates).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
    ]);
  });

  it('test_generateRecurringDates_invalid_range() - returns empty array if endDate < startDate', () => {
    const dates = generateRecurringDates({
      startDate: '2026-12-31',
      endDate: '2026-10-12',
      selectedDays: [1, 3],
      intervalWeeks: 1,
    });

    expect(dates).toEqual([]);
  });

  it('test_generateRecurringDates_biweekly() - assigns every 2 weeks', () => {
    const dates = generateRecurringDates({
      startDate: '2026-10-12',
      endDate: '2026-11-09',
      selectedDays: [1],
      intervalWeeks: 2,
    });

    expect(dates).toEqual([
      '2026-10-12',
      '2026-10-26',
      '2026-11-09',
    ]);
  });
});

describe('Training Log - Big Month Calendar View Generation (TDD)', () => {
  it('test_getMonthCalendarWeeks() - builds 7-day rows covering entire month', async () => {
    const { getMonthCalendarWeeks } = await import('../src/utils/calculations');
    // October 2026 (year 2026, month 9 for 0-indexed October, or 10 for 1-indexed)
    // Let's use standard year, month (1-12)
    const weeks = getMonthCalendarWeeks(2026, 10, 1); // 1 = Monday start
    expect(weeks.length).toBeGreaterThanOrEqual(5);

    // Each week must have exactly 7 days
    for (const w of weeks) {
      expect(w.days.length).toBe(7);
    }

    // October 12 must be present and marked as current month
    const oct12Found = weeks.some((w) =>
      w.days.some((d) => d.date === '2026-10-12' && d.isCurrentMonth && d.dayNumber === 12)
    );
    expect(oct12Found).toBe(true);

    // First day of first week must be Monday
    const firstDayDate = weeks[0].days[0].date;
    const [y, m, d] = firstDayDate.split('-').map(Number);
    expect(new Date(y, m - 1, d).getDay()).toBe(1); // 1 is Monday
  });
});

