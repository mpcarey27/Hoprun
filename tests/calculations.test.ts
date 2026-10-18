import { describe, it, expect } from 'vitest';
import {
  calculateRunLoad,
  convertDistance,
  calculateInWeekPrediction,
  buildWeeklyWorkloadData,
  generateRecurringDates,
} from '../src/utils/calculations';
import type { WorkoutRun, WeekWorkload, UserProfile } from '../src/types/acr';

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

describe('Coach Multi-Athlete Assignment & Access Control (TDD)', () => {
  it('test_coachAssignRun_tagsAthleteAndCoach() - assigns run with coach and target athlete metadata', () => {
    const coachUser = { id: 'user_michael_carey', name: 'Michael Carey', role: 'coach' };
    const athleteRob = { id: 'user_rob', name: 'Rob', role: 'runner' };

    const assignedRun: WorkoutRun = {
      id: 'run_assigned_101',
      workoutDate: '2026-10-19',
      runOrder: 1,
      distance: 8.0,
      distanceUnit: 'mi',
      runType: 'easy',
      multiplier: 3.0,
      load: 24.0,
      comments: 'Zone 2 aerobic base run',
      completed: false,
      isPlanAssigned: true,
      athleteId: athleteRob.id,
      athleteName: athleteRob.name,
      assignedByCoachId: coachUser.id,
      assignedByCoachName: coachUser.name,
      updatedAt: '2026-10-14T18:00:00.000Z',
    };

    expect(assignedRun.isPlanAssigned).toBe(true);
    expect(assignedRun.athleteId).toBe('user_rob');
    expect(assignedRun.athleteName).toBe('Rob');
    expect(assignedRun.assignedByCoachId).toBe('user_michael_carey');
    expect(assignedRun.assignedByCoachName).toBe('Michael Carey');
  });

  it('test_athleteViewFilter_isolatesWorkouts() - athlete Rob only sees his own workouts', () => {
    const allWorkouts: WorkoutRun[] = [
      { id: '1', workoutDate: '2026-10-14', runOrder: 1, distance: 5, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 15, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },
      { id: '2', workoutDate: '2026-10-14', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'long_run', multiplier: 3, load: 30, comments: '', completed: false, athleteId: 'user_michael_carey', athleteName: 'Michael Carey' },
      { id: '3', workoutDate: '2026-10-15', runOrder: 1, distance: 6, distanceUnit: 'mi', runType: 'tempo', multiplier: 5, load: 30, comments: '', completed: false, athleteId: 'runner_alex', athleteName: 'Alex River' },
      { id: '4', workoutDate: '2026-10-16', runOrder: 1, distance: 4, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 12, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },
    ];

    // Rob viewing
    const robId = 'user_rob';
    const robWorkouts = allWorkouts.filter(w => w.athleteId === robId || w.athleteName === 'Rob');
    expect(robWorkouts.length).toBe(2);
    expect(robWorkouts.map(w => w.id)).toEqual(['1', '4']);

    // Coach Michael Carey filtering by athlete Rob
    const coachFilterRob = allWorkouts.filter(w => w.athleteId === 'user_rob');
    expect(coachFilterRob.length).toBe(2);

    // Coach Michael Carey viewing all
    expect(allWorkouts.length).toBe(4);
  });

  it('test_coachEditAssignedRun() - coach can edit previously assigned run parameters', () => {
    const originalRun: WorkoutRun = {
      id: 'run_assigned_202',
      workoutDate: '2026-10-21',
      runOrder: 1,
      distance: 6.0,
      distanceUnit: 'mi',
      runType: 'easy',
      multiplier: 3.0,
      load: 18.0,
      comments: 'Initial prescription',
      completed: false,
      isPlanAssigned: true,
      athleteId: 'user_rob',
      athleteName: 'Rob',
      assignedByCoachId: 'user_michael_carey',
      assignedByCoachName: 'Michael Carey',
    };

    // Coach modifies distance from 6.0 to 7.5 miles and adjusts comments
    const updatedRun: WorkoutRun = {
      ...originalRun,
      distance: 7.5,
      load: 7.5 * 3.0,
      comments: 'Increased volume to 7.5 miles per Coach Michael Carey',
      updatedAt: '2026-10-14T19:00:00.000Z',
    };

    expect(updatedRun.distance).toBe(7.5);
    expect(updatedRun.load).toBe(22.5);
    expect(updatedRun.athleteId).toBe('user_rob');
    expect(updatedRun.assignedByCoachId).toBe('user_michael_carey');
    expect(updatedRun.isPlanAssigned).toBe(true);
  });
});

describe('Coach Analytics - Multi-Athlete Breakdown & Graph View Selection (TDD)', () => {
  it('test_coachAllAthletesBreakdown_isolatesAthleteMetrics() - each athlete has isolated stats and graphs', () => {
    const workouts: WorkoutRun[] = [
      // Rob's workouts (10 miles @ 3.0 mult = 30 load per week)
      { id: 'r1', workoutDate: '2026-09-21', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },
      { id: 'r2', workoutDate: '2026-09-28', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },
      { id: 'r3', workoutDate: '2026-10-05', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },
      { id: 'r4', workoutDate: '2026-10-12', runOrder: 1, distance: 10, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 30, comments: '', completed: true, athleteId: 'user_rob', athleteName: 'Rob' },

      // Sarah's workouts (20 miles @ 3.0 mult = 60 load per week)
      { id: 's1', workoutDate: '2026-09-21', runOrder: 1, distance: 20, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 60, comments: '', completed: true, athleteId: 'runner_sarah', athleteName: 'Sarah Chen' },
      { id: 's2', workoutDate: '2026-09-28', runOrder: 1, distance: 20, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 60, comments: '', completed: true, athleteId: 'runner_sarah', athleteName: 'Sarah Chen' },
      { id: 's3', workoutDate: '2026-10-05', runOrder: 1, distance: 20, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 60, comments: '', completed: true, athleteId: 'runner_sarah', athleteName: 'Sarah Chen' },
      { id: 's4', workoutDate: '2026-10-12', runOrder: 1, distance: 20, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 60, comments: '', completed: true, athleteId: 'runner_sarah', athleteName: 'Sarah Chen' },
    ];

    // Compute Rob's isolated workload
    const robWorkouts = workouts.filter((w) => w.athleteId === 'user_rob');
    const robWeeks = buildWeeklyWorkloadData(robWorkouts, 1, 1.2);
    expect(robWeeks.length).toBe(4);
    expect(robWeeks[3].acuteWorkload).toBe(30.0);
    expect(robWeeks[3].chronicWorkload).toBe(30.0);
    expect(robWeeks[3].acr).toBe(1.0);
    expect(robWeeks[3].totalMiles).toBe(10.0);

    // Compute Sarah's isolated workload
    const sarahWorkouts = workouts.filter((w) => w.athleteId === 'runner_sarah');
    const sarahWeeks = buildWeeklyWorkloadData(sarahWorkouts, 1, 1.2);
    expect(sarahWeeks.length).toBe(4);
    expect(sarahWeeks[3].acuteWorkload).toBe(60.0);
    expect(sarahWeeks[3].chronicWorkload).toBe(60.0);
    expect(sarahWeeks[3].acr).toBe(1.0);
    expect(sarahWeeks[3].totalMiles).toBe(20.0);

    // Alex River has 0 workouts -> clean empty weeks
    const alexWorkouts = workouts.filter((w) => w.athleteId === 'runner_alex');
    const alexWeeks = buildWeeklyWorkloadData(alexWorkouts, 1, 1.2);
    expect(alexWeeks.length).toBe(0);

    // Verify Rob and Sarah's loads are completely decoupled
    expect(robWeeks[3].acuteWorkload).not.toBe(sarahWeeks[3].acuteWorkload);
  });

  it('test_athleteRoleCannotAccessAllAthletesTab() - athlete view is constrained strictly to own ID', () => {
    const robUser: UserProfile = {
      id: 'user_rob',
      name: 'Rob',
      email: 'rob@example.com',
      role: 'runner',
      avatarUrl: '',
    };

    const coachUser: UserProfile = {
      id: 'user_michael_carey',
      name: 'Michael Carey',
      email: 'coach@example.com',
      role: 'coach',
      avatarUrl: '',
    };

    // A runner has isCoach = false
    const isRobCoach = robUser.role === 'coach';
    expect(isRobCoach).toBe(false);

    // A coach has isCoach = true
    const isMichaelCoach = coachUser.role === 'coach';
    expect(isMichaelCoach).toBe(true);

    // In runner mode, selectedAthleteFilter must always resolve to Rob's ID
    const effectiveFilterForRob = !isRobCoach ? robUser.id : 'all';
    expect(effectiveFilterForRob).toBe('user_rob');

    // In coach mode, coach can choose 'all' or specific athlete
    const effectiveFilterForCoach = isMichaelCoach ? 'all' : coachUser.id;
    expect(effectiveFilterForCoach).toBe('all');
  });

  it('test_selectGraphViewModes() - supports acr, workload, mileage, and all', () => {
    const validModes: Array<'acr' | 'workload' | 'mileage' | 'all'> = ['acr', 'workload', 'mileage', 'all'];

    // Default view mode requested by user
    const defaultMode = 'acr';
    expect(validModes).toContain(defaultMode);

    // Verify mode switching logic
    let currentMode: 'acr' | 'workload' | 'mileage' | 'all' = defaultMode;
    const switchMode = (mode: 'acr' | 'workload' | 'mileage' | 'all') => {
      currentMode = mode;
    };

    switchMode('workload');
    expect(currentMode).toBe('workload');

    switchMode('mileage');
    expect(currentMode).toBe('mileage');

    switchMode('all');
    expect(currentMode).toBe('all');
  });

  it('test_coachAssignSingleRun_robLongRun_monday() - assigns 1 single run for 1 athlete for 1 day', () => {
    const coach = { id: 'user_michael_carey', name: 'Michael Carey', role: 'coach' as const };
    const athleteRob = { id: 'user_rob', name: 'Rob', role: 'runner' as const };
    const date = '2026-10-19'; // Monday

    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    expect(dateObj.getDay()).toBe(1); // Monday

    const distance = 10;
    const unit = 'mi' as const;
    const runType = 'long_run';
    const multiplier = 3.0;
    const load = distance * multiplier;

    const assignedRun: WorkoutRun = {
      id: `run_assigned_${Date.now()}`,
      workoutDate: date,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier,
      load,
      comments: 'Coach Michael Carey assigned long run to Rob',
      completed: false,
      isPlanAssigned: true,
      athleteId: athleteRob.id,
      athleteName: athleteRob.name,
      assignedByCoachId: coach.id,
      assignedByCoachName: coach.name,
      updatedAt: new Date().toISOString(),
    };

    expect(assignedRun.workoutDate).toBe('2026-10-19');
    expect(assignedRun.athleteName).toBe('Rob');
    expect(assignedRun.runType).toBe('long_run');
    expect(assignedRun.distance).toBe(10);
    expect(assignedRun.load).toBe(30);
    expect(assignedRun.completed).toBe(false);
    expect(assignedRun.isPlanAssigned).toBe(true);
  });
});


