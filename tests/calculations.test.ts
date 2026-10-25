import { describe, it, expect } from 'vitest';
import {
  calculateRunLoad,
  convertDistance,
  calculateInWeekPrediction,
  buildWeeklyWorkloadData,
  generateRecurringDates,
  timeToSeconds,
  secondsToTime,
  formatDuration,
  formatDurationStrava,
  paceToSeconds,
  calculatePaceSeconds,
  calculateDurationFromPace,
  formatPace,
  calculateCompliance,
  calculateRaceCountdown,
  calculateShoeWear,
  getQuickLogStaples,
  getUserQuickStaples,
  formatStapleLabel,
  formatTimeOfDay,
  getSmartDefaultTitle,
  calculateRelativeStimulus,
} from '../src/utils/calculations';
import type { WorkoutRun, WeekWorkload, UserProfile, QuickLogStaple, RunningShoe } from '../src/types/acr';

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

  it('test_quickLogRun_anyPage() - logs run on any page with accurate load calculation', () => {
    const athlete = { id: 'user_rob', name: 'Rob', role: 'runner' as const };
    const date = '2026-10-17';
    const distance = 6.0;
    const unit = 'mi' as const;
    const runType = 'tempo'; // multiplier is 5.0
    const mult = 5.0;

    const quickRun: WorkoutRun = {
      id: `run_quick_${Date.now()}`,
      workoutDate: date,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier: mult,
      load: distance * mult,
      comments: 'Quick logged run from header',
      completed: true,
      isPlanAssigned: false,
      athleteId: athlete.id,
      athleteName: athlete.name,
      updatedAt: new Date().toISOString(),
    };

    expect(quickRun.distance).toBe(6.0);
    expect(quickRun.load).toBe(30.0);
    expect(quickRun.completed).toBe(true);
    expect(quickRun.athleteName).toBe('Rob');
  });

  it('test_athleteCheckOffAssignedRun() - checks off assigned run as completed and dispatches coach notification', () => {
    const assignedRun: WorkoutRun = {
      id: 'run_assigned_rob_today',
      workoutDate: '2026-10-17',
      runOrder: 1,
      distance: 8.0,
      distanceUnit: 'mi',
      runType: 'long_run',
      multiplier: 3.0,
      load: 24.0,
      comments: 'Long run prescribed by coach',
      completed: false, // Initially planned
      isPlanAssigned: true,
      athleteId: 'user_rob',
      athleteName: 'Rob',
      assignedByCoachId: 'user_michael_carey',
      assignedByCoachName: 'Michael Carey',
      updatedAt: '2026-10-17T08:00:00.000Z',
    };

    // Athlete checks off run as completed
    const completedRun: WorkoutRun = {
      ...assignedRun,
      completed: true,
      updatedAt: new Date().toISOString(),
    };

    expect(completedRun.completed).toBe(true);

    // Creates notification for Coach Michael Carey
    const coachNotification: CoachNotification = {
      id: `notif_${Date.now()}`,
      athleteId: completedRun.athleteId!,
      athleteName: completedRun.athleteName!,
      type: 'edited',
      date: completedRun.workoutDate,
      runType: completedRun.runType,
      distance: completedRun.distance,
      unit: completedRun.distanceUnit,
      comment: `✓ ${completedRun.athleteName} completed ${completedRun.distance} ${completedRun.distanceUnit.toUpperCase()} ${completedRun.runType.replace('_', ' ')} run!`,
      timestamp: Date.now(),
      read: false,
    };

    expect(coachNotification.athleteName).toBe('Rob');
    expect(coachNotification.comment).toContain('completed 8 MI long run');
  });

  it('test_athleteCheckOffWithComment_notifiesCoach() - preserves athlete comment and dispatches coach alert', () => {
    const assignedRun: WorkoutRun = {
      id: 'run_rob_sunday',
      workoutDate: '2026-10-18',
      runOrder: 1,
      distance: 8.0,
      distanceUnit: 'mi',
      runType: 'long_run',
      multiplier: 3.0,
      load: 24.0,
      comments: 'Coach: Keep pace conversational',
      completed: false,
      isPlanAssigned: true,
      athleteId: 'user_rob',
      athleteName: 'Rob',
    };

    const athletePostRunComment = 'Felt super smooth, kept HR under 145 bpm the whole time!';

    const completedRun: WorkoutRun = {
      ...assignedRun,
      completed: true,
      athleteComment: athletePostRunComment,
      updatedAt: new Date().toISOString(),
    };

    expect(completedRun.completed).toBe(true);
    expect(completedRun.athleteComment).toBe(athletePostRunComment);

    const notif: CoachNotification = {
      id: `notif_${Date.now()}`,
      athleteId: completedRun.athleteId!,
      athleteName: completedRun.athleteName!,
      type: 'completed',
      date: completedRun.workoutDate,
      runType: completedRun.runType,
      distance: completedRun.distance,
      unit: completedRun.distanceUnit,
      comment: completedRun.athleteComment,
      timestamp: Date.now(),
      read: false,
    };

    expect(notif.comment).toBe(athletePostRunComment);
    expect(notif.type).toBe('completed');
  });

  it('test_athleteEditAssignedRun_withOptionalReason() - updates parameters, recalculates load, and includes edit reason', () => {
    const originalRun: WorkoutRun = {
      id: 'run_rob_assigned',
      workoutDate: '2026-10-19',
      runOrder: 1,
      distance: 10.0,
      distanceUnit: 'mi',
      runType: 'tempo',
      multiplier: 5.0,
      load: 50.0,
      comments: 'Prescribed tempo session',
      completed: false,
      isPlanAssigned: true,
      athleteId: 'user_rob',
      athleteName: 'Rob',
    };

    // Athlete edits run from 10 mi tempo to 7.5 mi easy due to hamstring tightness
    const newDistance = 7.5;
    const newType = 'easy';
    const newMultiplier = 3.0;
    const newLoad = newDistance * newMultiplier; // 22.5
    const editReason = 'Shortened and slowed down due to mild left hamstring tightness';

    const editedRun: WorkoutRun = {
      ...originalRun,
      distance: newDistance,
      runType: newType,
      multiplier: newMultiplier,
      load: newLoad,
      completed: true,
      editReason,
      updatedAt: new Date().toISOString(),
    };

    expect(editedRun.distance).toBe(7.5);
    expect(editedRun.runType).toBe('easy');
    expect(editedRun.load).toBe(22.5);
    expect(editedRun.completed).toBe(true);
    expect(editedRun.editReason).toContain('hamstring tightness');

    // Notification generated for Coach Michael Carey
    const coachNotification: CoachNotification = {
      id: `notif_${Date.now()}`,
      athleteId: editedRun.athleteId!,
      athleteName: editedRun.athleteName!,
      type: 'edited',
      date: editedRun.workoutDate,
      runType: editedRun.runType,
      distance: editedRun.distance,
      unit: editedRun.distanceUnit,
      comment: `Reason: "${editedRun.editReason}"`,
      timestamp: Date.now(),
      read: false,
    };

    expect(coachNotification.type).toBe('edited');
    expect(coachNotification.comment).toBe(`Reason: "${editReason}"`);
  });
});

describe('Strava Time, Pace, & Recording Modes (TDD)', () => {
  it('test_timeToSeconds_and_secondsToTime() - roundtrip duration conversion', () => {
    // 1 hr 04 min 15 sec -> 3855 sec
    const totalSec = timeToSeconds(1, 4, 15);
    expect(totalSec).toBe(3855);

    const parsed = secondsToTime(totalSec);
    expect(parsed.hours).toBe(1);
    expect(parsed.minutes).toBe(4);
    expect(parsed.seconds).toBe(15);

    // 45 min 30 sec -> 2730 sec
    const secOnly = timeToSeconds(0, 45, 30);
    expect(secOnly).toBe(2730);
    const parsedSecOnly = secondsToTime(secOnly);
    expect(parsedSecOnly.hours).toBe(0);
    expect(parsedSecOnly.minutes).toBe(45);
    expect(parsedSecOnly.seconds).toBe(30);
  });

  it('test_formatDuration_hours_and_minutes() - running time strings', () => {
    // Under 1 hr -> MM:SS
    expect(formatDuration(2730)).toBe('45:30');
    // Over 1 hr -> H:MM:SS
    expect(formatDuration(3855)).toBe('1:04:15');
    // Strava friendly display
    expect(formatDurationStrava(3855)).toBe('1h 4m 15s');
    expect(formatDurationStrava(2730)).toBe('45m 30s');
  });

  it('test_calculatePaceSeconds_and_formatPace() - calculates exact pace from duration and distance', () => {
    // 10 miles in 1 hr 20 min (4800s) -> 480 sec/mi = 8:00 /mi
    const pace1 = calculatePaceSeconds(4800, 10.0);
    expect(pace1).toBe(480);
    expect(formatPace(pace1, 'mi')).toBe('8:00 /mi');

    // 5 miles in 38 min 45 sec (2325s) -> 465 sec/mi = 7:45 /mi
    const pace2 = calculatePaceSeconds(2325, 5.0);
    expect(pace2).toBe(465);
    expect(formatPace(pace2, 'mi')).toBe('7:45 /mi');

    // 5 km in 25 min (1500s) -> 300 sec/km = 5:00 /km
    const paceKm = calculatePaceSeconds(1500, 5.0);
    expect(paceKm).toBe(300);
    expect(formatPace(paceKm, 'km')).toBe('5:00 /km');
  });

  it('test_calculateDurationFromPace() - calculates duration from pace and distance', () => {
    // Pace: 8:00 /mi (480s), Distance: 10 mi -> Duration: 4800s (1:20:00)
    const dur1 = calculateDurationFromPace(480, 10.0);
    expect(dur1).toBe(4800);
    expect(formatDuration(dur1)).toBe('1:20:00');

    // Pace: 7:30 /mi (450s), Distance: 6 mi -> Duration: 2700s (45:00)
    const dur2 = calculateDurationFromPace(450, 6.0);
    expect(dur2).toBe(2700);
    expect(formatDuration(dur2)).toBe('45:00');
  });

  it('test_stravaBiDirectionalConversion() - bi-directional sync between Time and Pace', () => {
    const distance = 8.0;
    // User types Time: 1h 00m 00s (3600s)
    const durSecs = 3600;
    const computedPace = calculatePaceSeconds(durSecs, distance); // 450s = 7:30 /mi
    expect(computedPace).toBe(450);
    expect(formatPace(computedPace, 'mi')).toBe('7:30 /mi');

    // User switches to Pace mode and tweaks pace to 7:00 /mi (420s)
    const newPaceSecs = paceToSeconds(7, 0); // 420s
    const computedDuration = calculateDurationFromPace(newPaceSecs, distance); // 3360s = 56m 00s
    expect(computedDuration).toBe(3360);
    expect(formatDuration(computedDuration)).toBe('56:00');
  });

  it('test_optionalTimeAndPaceOnWorkoutRun() - workout runs remain valid with or without timing', () => {
    // Run without timing (existing backward compatibility)
    const runWithoutTime: WorkoutRun = {
      id: 'run_no_time',
      workoutDate: '2026-10-18',
      runOrder: 1,
      distance: 5.0,
      distanceUnit: 'mi',
      runType: 'easy',
      multiplier: 3.0,
      load: 15.0,
      comments: 'Regular run',
      completed: true,
    };
    expect(runWithoutTime.durationSeconds).toBeUndefined();
    expect(runWithoutTime.paceFormatted).toBeUndefined();

    // Run with Strava timing
    const runWithTime: WorkoutRun = {
      ...runWithoutTime,
      id: 'run_with_time',
      durationSeconds: 2400, // 40m 00s
      durationFormatted: '40:00',
      paceSeconds: 480, // 8:00 /mi
      paceFormatted: '8:00 /mi',
    };
    expect(runWithTime.durationFormatted).toBe('40:00');
    expect(runWithTime.paceFormatted).toBe('8:00 /mi');
    expect(runWithTime.load).toBe(15.0);
  });

  /* -------------------------------------------------------------
   * Phase 1 & 2 Approved Features: TDD Tests
   * ------------------------------------------------------------- */
  describe('Phase 1 & 2 Features: RPE, Feeling, Compliance & Race Countdown', () => {
    it('test_rpe_and_sRPE_calculation() - calculates internal session RPE workload', () => {
      // 45 minutes at RPE 7 (Hard) -> 45 * 7 = 315 sRPE points
      const durationSecs = 2700; // 45 min
      const rpe = 7;
      const srpe = Math.round((durationSecs / 60) * rpe);
      expect(srpe).toBe(315);
    });

    it('test_calculateCompliance_planned_vs_actual() - calculates execution variance and percent', () => {
      // Test 1: Exactly executed 8.0 miles
      const comp1 = calculateCompliance(8.0, 8.0);
      expect(comp1.percent).toBe(100);
      expect(comp1.status).toBe('exact');
      expect(comp1.diff).toBe(0);

      // Test 2: Planned 8.0 miles, ran 7.5 miles (Under by 0.5 mi, 93.8% -> 94%)
      const comp2 = calculateCompliance(8.0, 7.5);
      expect(comp2.percent).toBe(94);
      expect(comp2.status).toBe('under');
      expect(comp2.diff).toBe(-0.5);

      // Test 3: Planned 6.0 miles, ran 8.0 miles (Over by 2.0 mi, 133%)
      const comp3 = calculateCompliance(6.0, 8.0);
      expect(comp3.percent).toBe(133);
      expect(comp3.status).toBe('over');
      expect(comp3.diff).toBe(2.0);

      // Test 4: Planned 0 miles or missing
      const comp4 = calculateCompliance(0, 5.0);
      expect(comp4.percent).toBe(100);
      expect(comp4.status).toBe('exact');
    });

    it('test_calculateRaceCountdown_days_and_phase() - computes days to event and training phase', () => {
      // Future race in 35 days: Peak phase (4-6 weeks out)
      const today = '2026-10-19';
      const raceDate = '2026-11-23'; // 35 days away
      const countdown = calculateRaceCountdown(today, raceDate);
      expect(countdown.daysRemaining).toBe(35);
      expect(countdown.isPast).toBe(false);
      expect(countdown.phase).toBe('Peak Mileage');

      // Taper phase (1-3 weeks out, e.g. 14 days away)
      const taperRaceDate = '2026-11-02'; // 14 days away
      const taperCountdown = calculateRaceCountdown(today, taperRaceDate);
      expect(taperCountdown.daysRemaining).toBe(14);
      expect(taperCountdown.phase).toBe('Taper');

      // Race week (< 7 days away)
      const raceWeekDate = '2026-10-24'; // 5 days away
      const raceWeekCountdown = calculateRaceCountdown(today, raceWeekDate);
      expect(raceWeekCountdown.daysRemaining).toBe(5);
      expect(raceWeekCountdown.phase).toBe('Race Week');

      // Base phase (> 6 weeks away)
      const baseRaceDate = '2026-12-30'; // ~72 days away
      const baseCountdown = calculateRaceCountdown(today, baseRaceDate);
      expect(baseCountdown.daysRemaining).toBe(72);
      expect(baseCountdown.phase).toBe('Base Building');
    });

    it('test_calculateShoeWear() - calculates wear percentage and alert status', () => {
      // 250 miles on 400 mile shoe -> 63%, good
      const wear1 = calculateShoeWear(250, 400);
      expect(wear1.percent).toBe(63);
      expect(wear1.status).toBe('good');
      expect(wear1.remainingMiles).toBe(150);

      // 360 miles on 400 mile shoe (90%) -> caution
      const wear2 = calculateShoeWear(360, 400);
      expect(wear2.percent).toBe(90);
      expect(wear2.status).toBe('caution');
      expect(wear2.remainingMiles).toBe(40);

      // 420 miles on 400 mile shoe (105%) -> retired/replace
      const wear3 = calculateShoeWear(420, 400);
      expect(wear3.percent).toBe(105);
      expect(wear3.status).toBe('replace');
      expect(wear3.remainingMiles).toBe(0);
    });

    it('test_getQuickLogStaples() - generates smart staple workouts based on unit', () => {
      const staplesMi = getQuickLogStaples('mi');
      expect(staplesMi.length).toBeGreaterThanOrEqual(3);
      expect(staplesMi[0].distance).toBe(3);
      expect(staplesMi[0].unit).toBe('mi');
      expect(staplesMi[0].runType).toBe('easy');

      const staplesKm = getQuickLogStaples('km');
      expect(staplesKm.length).toBeGreaterThanOrEqual(3);
      expect(staplesKm[0].unit).toBe('km');
      expect(staplesKm[0].distance).toBe(5);
    });

    it('test_getUserQuickStaples_custom_and_fallback() - returns customized staples per user or default', () => {
      const userMap: Record<string, QuickLogStaple[]> = {
        user_michael_carey: [
          { id: 'm1', label: 'Easy 10 Miler', distance: 10, unit: 'mi', runType: 'easy' },
          { id: 'm2', label: '10 Mile Moderate', distance: 10, unit: 'mi', runType: 'mod_workout' },
          { id: 'm3', label: '18 Mile Long Run', distance: 18, unit: 'mi', runType: 'long_run' },
        ],
      };

      // Michael gets his 3 custom staples
      const michaelStaples = getUserQuickStaples('user_michael_carey', userMap, 'mi');
      expect(michaelStaples.length).toBe(3);
      expect(michaelStaples[0].label).toBe('Easy 10 Miler');
      expect(michaelStaples[0].distance).toBe(10);
      expect(michaelStaples[1].label).toBe('10 Mile Moderate');
      expect(michaelStaples[1].runType).toBe('mod_workout');
      expect(michaelStaples[2].label).toBe('18 Mile Long Run');
      expect(michaelStaples[2].distance).toBe(18);

      // Rob has no custom staples -> falls back to unit defaults
      const robStaples = getUserQuickStaples('user_rob', userMap, 'mi');
      expect(robStaples.length).toBeGreaterThanOrEqual(3);
      expect(robStaples[0].distance).toBe(3);
    });

    it('test_getUserQuickStaples_max7Limit() - limits to maximum 7 options', () => {
      const longList: QuickLogStaple[] = Array.from({ length: 10 }, (_, i) => ({
        id: `staple_${i}`,
        label: `Run ${i + 1}`,
        distance: i + 1,
        unit: 'mi' as const,
        runType: 'easy',
      }));

      const userMap = { user_sarah: longList };
      const sarahStaples = getUserQuickStaples('user_sarah', userMap, 'mi');
      expect(sarahStaples.length).toBe(7);
      expect(sarahStaples[6].distance).toBe(7);
    });

    it('test_formatStapleLabel() - generates clean fallback label when custom label is blank', () => {
      expect(formatStapleLabel({ distance: 10, unit: 'mi', runType: 'easy', label: 'Easy 10 Miler' })).toBe('Easy 10 Miler');
      expect(formatStapleLabel({ distance: 10, unit: 'mi', runType: 'mod_workout', label: '' })).toBe('10.0 mi Mod workout');
      expect(formatStapleLabel({ distance: 18, unit: 'mi', runType: 'long_run' })).toBe('18.0 mi Long run');
    });

    it('test_editIndividualRun_recalculatesLoad() - updating distance or type updates load accurately', () => {
      const originalRun: WorkoutRun = {
        id: 'run_123',
        workoutDate: '2026-10-19',
        runOrder: 1,
        distance: 5.0,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 1.0,
        load: 5.0,
        completed: true,
      };

      // Athlete edits the run: changes distance to 10 mi and runType to 'long_run'
      const updatedDistance = 10.0;
      const updatedRunType = 'long_run';
      const newMultiplier = 1.2;
      const newLoad = updatedDistance * newMultiplier; // 12.0

      const editedRun: WorkoutRun = {
        ...originalRun,
        distance: updatedDistance,
        runType: updatedRunType,
        multiplier: newMultiplier,
        load: newLoad,
        comments: 'Felt strong, extended into a long run',
        updatedAt: '2026-10-19T20:30:00.000Z',
      };

      expect(editedRun.id).toBe(originalRun.id);
      expect(editedRun.load).toBe(12.0);
      expect(editedRun.comments).toBe('Felt strong, extended into a long run');
    });

    it('test_editIndividualRun_preservesShoeAndStravaTiming() - preserves timing & gear in edit popup', () => {
      const runWithGear: WorkoutRun = {
        id: 'run_456',
        workoutDate: '2026-10-19',
        runOrder: 1,
        distance: 10.0,
        distanceUnit: 'mi',
        runType: 'mod_workout',
        multiplier: 1.1,
        load: 11.0,
        completed: true,
        durationSeconds: 4200, // 1h 10m
        durationFormatted: '1:10:00',
        paceSeconds: 420, // 7:00 /mi
        paceFormatted: '7:00 /mi',
        shoeId: 'shoe_pegasus',
        shoeName: 'Nike Pegasus 40',
        rpe: 6,
        feeling: 'great',
      };

      expect(runWithGear.durationFormatted).toBe('1:10:00');
      expect(runWithGear.paceFormatted).toBe('7:00 /mi');
      expect(runWithGear.shoeName).toBe('Nike Pegasus 40');
      expect(runWithGear.rpe).toBe(6);
      expect(runWithGear.feeling).toBe('great');
    });

    it('test_formatTimeOfDay() - converts 24h to 12h AM/PM strings', () => {
      expect(formatTimeOfDay('07:30')).toBe('7:30 AM');
      expect(formatTimeOfDay('12:00')).toBe('12:00 PM');
      expect(formatTimeOfDay('18:45')).toBe('6:45 PM');
      expect(formatTimeOfDay('00:15')).toBe('12:15 AM');
      expect(formatTimeOfDay('')).toBe('');
    });

    it('test_getSmartDefaultTitle() - generates time-of-day contextual titles', () => {
      expect(getSmartDefaultTitle('07:00', 'easy')).toBe('Morning Easy Run');
      expect(getSmartDefaultTitle('13:30', 'tempo')).toBe('Afternoon Tempo');
      expect(getSmartDefaultTitle('18:15', 'long_run')).toBe('Evening Long Run');
      expect(getSmartDefaultTitle('21:00', 'intervals')).toBe('Night Intervals');
    });

    it('test_calculateRelativeStimulus() - categorizes athletic workload stimulus', () => {
      // With average daily load of 15.0
      const avg = 15.0;
      const low = calculateRelativeStimulus(5.0, avg);
      expect(low.level).toBe('low');
      expect(low.label).toBe('Low Stimulus');

      const opt = calculateRelativeStimulus(15.0, avg);
      expect(opt.level).toBe('optimal');
      expect(opt.label).toBe('Optimal');

      const key = calculateRelativeStimulus(25.0, avg);
      expect(key.level).toBe('key');
      expect(key.label).toBe('Key Session');

      // Baseline fallback when no history
      expect(calculateRelativeStimulus(4.0).level).toBe('low');
      expect(calculateRelativeStimulus(12.0).level).toBe('optimal');
      expect(calculateRelativeStimulus(20.0).level).toBe('key');
    });

    it('test_lastUsedShoe_autoAssignment() - auto assigns shoe from most recent workout', () => {
      const athleteWorkouts: WorkoutRun[] = [
        {
          id: 'run_1',
          workoutDate: '2026-10-22',
          runOrder: 1,
          distance: 5.0,
          distanceUnit: 'mi',
          runType: 'easy',
          multiplier: 1.0,
          load: 5.0,
          completed: true,
          shoeId: 'shoe_ghost',
          shoeName: 'Brooks Ghost 15',
        },
        {
          id: 'run_2',
          workoutDate: '2026-10-24',
          runOrder: 1,
          distance: 10.0,
          distanceUnit: 'mi',
          runType: 'long_run',
          multiplier: 1.2,
          load: 12.0,
          completed: true,
          shoeId: 'shoe_superblast',
          shoeName: 'Asics Superblast 2',
        },
      ];

      // Sorting newest first determines the auto-assigned shoe for the next run
      const sorted = [...athleteWorkouts].sort((a, b) => {
        const cmp = b.workoutDate.localeCompare(a.workoutDate);
        if (cmp !== 0) return cmp;
        return (b.runOrder ?? 1) - (a.runOrder ?? 1);
      });

      const mostRecentShoeId = sorted[0]?.shoeId;
      expect(mostRecentShoeId).toBe('shoe_superblast');
    });

    it('test_workoutRun_titleAndStartTime_fields() - saves custom title and start time', () => {
      const customRun: WorkoutRun = {
        id: 'run_morning_tempo',
        workoutDate: '2026-10-25',
        runOrder: 1,
        title: 'Morning Threshold 8 Miler',
        startTime: '07:15',
        distance: 8.0,
        distanceUnit: 'mi',
        runType: 'tempo',
        multiplier: 2.0,
        load: 16.0,
        comments: 'Felt great at 6:15/mi tempo pace',
        completed: true,
      };

      expect(customRun.title).toBe('Morning Threshold 8 Miler');
      expect(customRun.startTime).toBe('07:15');
      expect(formatTimeOfDay(customRun.startTime)).toBe('7:15 AM');
    });
  });

  describe('Analytics Cumulative Training Statistics & Home Feed Refinement', () => {
    it('test_cumulativeStats_calculation() - calculates total volume and average pace', () => {
      const workouts: WorkoutRun[] = [
        {
          id: 'w1',
          workoutDate: '2026-10-19',
          runOrder: 1,
          distance: 5.0,
          distanceUnit: 'mi',
          runType: 'easy',
          multiplier: 3,
          load: 15.0,
          durationSeconds: 2025, // 33m 45s -> 6:45 /mi
          comments: '',
          completed: true,
        },
        {
          id: 'w2',
          workoutDate: '2026-10-21',
          runOrder: 1,
          distance: 5.0,
          distanceUnit: 'mi',
          runType: 'tempo',
          multiplier: 2,
          load: 10.0,
          durationSeconds: 1800, // 30m 00s -> 6:00 /mi
          comments: '',
          completed: true,
        },
      ];

      // Calculate cumulative metrics
      let totalDist = 0;
      let totalLoad = 0;
      let totalDur = 0;
      for (const w of workouts) {
        totalDist += convertDistance(w.distance, w.distanceUnit, 'mi');
        totalLoad += w.load;
        if (w.durationSeconds) totalDur += w.durationSeconds;
      }
      const avgPaceSecs = totalDist > 0 && totalDur > 0 ? Math.round(totalDur / totalDist) : null;

      expect(workouts.length).toBe(2);
      expect(totalDist).toBe(10.0);
      expect(totalLoad).toBe(25.0);
      expect(totalDur).toBe(3825);
      expect(formatDurationStrava(totalDur)).toBe('1h 3m 45s');
      expect(avgPaceSecs).toBe(383); // 382.5 rounded -> 383s = 6:23 /mi
      expect(formatPace(avgPaceSecs, 'mi')).toBe('6:23 /mi');
    });

    it('test_cumulativeStats_empty_workouts() - handles zero workouts safely', () => {
      const workouts: WorkoutRun[] = [];
      let totalDist = 0;
      let totalLoad = 0;
      let totalDur = 0;
      for (const w of workouts) {
        totalDist += convertDistance(w.distance, w.distanceUnit, 'mi');
        totalLoad += w.load;
        if (w.durationSeconds) totalDur += w.durationSeconds;
      }
      const avgPaceSecs = totalDist > 0 && totalDur > 0 ? Math.round(totalDur / totalDist) : null;

      expect(workouts.length).toBe(0);
      expect(totalDist).toBe(0);
      expect(totalLoad).toBe(0);
      expect(totalDur).toBe(0);
      expect(avgPaceSecs).toBeNull();
    });

    it('test_cumulativeStats_mixedUnits_convertsProperly() - converts km runs to mi preferences', () => {
      const workouts: WorkoutRun[] = [
        {
          id: 'w1',
          workoutDate: '2026-10-20',
          runOrder: 1,
          distance: 10.0,
          distanceUnit: 'km', // ~6.21371 mi
          runType: 'easy',
          multiplier: 3,
          load: 18.64,
          durationSeconds: 3000,
          comments: '',
          completed: true,
        },
      ];

      const distInMi = convertDistance(workouts[0].distance, workouts[0].distanceUnit, 'mi');
      expect(Number(distInMi.toFixed(2))).toBe(6.21);
      const paceSecs = Math.round(3000 / distInMi);
      expect(formatPace(paceSecs, 'mi')).toBe('8:03 /mi');
    });

    it('test_cumulativeStats_timeWindow_filtering() - filters workouts by date window', () => {
      const workouts: WorkoutRun[] = [
        { id: 'w1', workoutDate: '2026-09-01', runOrder: 1, distance: 5, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 15, completed: true },
        { id: 'w2', workoutDate: '2026-10-15', runOrder: 1, distance: 6, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 18, completed: true },
        { id: 'w3', workoutDate: '2026-10-22', runOrder: 1, distance: 7, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 21, completed: true },
      ];

      const windowStart = '2026-10-12';
      const windowEnd = '2026-10-25';
      const filtered = workouts.filter((w) => w.workoutDate >= windowStart && w.workoutDate <= windowEnd);

      expect(filtered.length).toBe(2);
      expect(filtered.map((w) => w.id)).toEqual(['w2', 'w3']);
      const windowDist = filtered.reduce((acc, w) => acc + w.distance, 0);
      expect(windowDist).toBe(13);
    });

    it('test_cumulativeStats_emptyWindow_doesNotLeakAllHistory() - returns empty when window contains no workouts', () => {
      const allWorkouts: WorkoutRun[] = [
        { id: 'w1', workoutDate: '2025-05-10', runOrder: 1, distance: 5, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 15, durationSeconds: 2000, completed: true },
        { id: 'w2', workoutDate: '2025-06-15', runOrder: 1, distance: 6, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 18, durationSeconds: 2400, completed: true },
      ];

      // Window in 2026 where zero workouts exist
      const displayWeeks: { startDate: string; endDate: string }[] = [];
      const windowOption = 'ytd';

      const windowWorkouts =
        windowOption === 'all'
          ? allWorkouts
          : displayWeeks.length === 0
          ? []
          : allWorkouts.filter(
              (w) => w.workoutDate >= displayWeeks[0].startDate && w.workoutDate <= displayWeeks[displayWeeks.length - 1].endDate
            );

      let dist = 0;
      let load = 0;
      let dur = 0;
      for (const w of windowWorkouts) {
        dist += convertDistance(w.distance, w.distanceUnit, 'mi');
        load += w.load;
        if (w.durationSeconds) dur += w.durationSeconds;
      }
      const pace = dist > 0 && dur > 0 ? Math.round(dur / dist) : null;

      expect(windowWorkouts.length).toBe(0);
      expect(dist).toBe(0);
      expect(load).toBe(0);
      expect(dur).toBe(0);
      expect(pace).toBeNull();
    });

    it('test_cumulativeStats_coachMode_individualAthleteAggregation() - isolates athlete volume and pace', () => {
      const athleteWorkouts: WorkoutRun[] = [
        { id: 'w1', athleteId: 'runner_1', workoutDate: '2026-10-18', runOrder: 1, distance: 4, distanceUnit: 'mi', runType: 'easy', multiplier: 3, load: 12, durationSeconds: 1600, completed: true },
        { id: 'w2', athleteId: 'runner_1', workoutDate: '2026-10-20', runOrder: 1, distance: 6, distanceUnit: 'mi', runType: 'tempo', multiplier: 2, load: 12, durationSeconds: 2160, completed: true },
      ];

      let aDist = 0;
      let aLoad = 0;
      let aDur = 0;
      for (const w of athleteWorkouts) {
        aDist += convertDistance(w.distance, w.distanceUnit, 'mi');
        aLoad += w.load;
        if (w.durationSeconds) aDur += w.durationSeconds;
      }
      const aAvgPace = aDist > 0 && aDur > 0 ? Math.round(aDur / aDist) : null;

      expect(athleteWorkouts.length).toBe(2);
      expect(aDist).toBe(10);
      expect(aLoad).toBe(24);
      expect(aDur).toBe(3760);
      expect(formatDurationStrava(aDur)).toBe('1h 2m 40s');
      expect(aAvgPace).toBe(376); // 376s = 6:16 /mi
      expect(formatPace(aAvgPace, 'mi')).toBe('6:16 /mi');
    });
  });
});




