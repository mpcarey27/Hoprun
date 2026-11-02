import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import {
  DEFAULT_MASTER_STRAVA_CLIENT_ID,
  parseCsvLine,
  parseStravaArchiveCsv,
  parseStravaArchiveZip,
  buildStravaAuthUrl,
  parseDateToEpochSeconds,
  fetchAllStravaActivitiesSince,
  fetchStravaActivitiesPage,
  encodeStravaOAuthState,
  decodeStravaOAuthState,
  reconcileStravaWorkouts,
} from '../src/utils/stravaSync';
import { syncWorkoutsFromCloud, sanitizeLegacyWorkouts, addAthleteToRoster } from '../src/utils/storage';

describe('Free Strava Sync & Archive Import (TDD)', () => {
  it('DEFAULT_MASTER_STRAVA_CLIENT_ID is configured to Coach verified application', () => {
    expect(DEFAULT_MASTER_STRAVA_CLIENT_ID).toBe('291001');
  });

  it('buildStravaAuthUrl generates standard 1-click authorization URL with master clientId', () => {
    const url = buildStravaAuthUrl('291001', 'https://hoprun.app/', 'mock_state_123');
    expect(url).toContain('https://www.strava.com/oauth/authorize');
    expect(url).toContain('client_id=291001');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fhoprun.app%2F');
    expect(url).toContain('activity%3Aread_all');
    expect(url).toContain('state=mock_state_123');
  });

  it('parseCsvLine correctly parses standard and quoted CSV values', () => {
    const standard = parseCsvLine('12345,Run,Morning Run,10.5');
    expect(standard).toEqual(['12345', 'Run', 'Morning Run', '10.5']);

    const quoted = parseCsvLine('98765,Run,"Morning Run, Easy & Chill",8.2');
    expect(quoted).toEqual(['98765', 'Run', 'Morning Run, Easy & Chill', '8.2']);
  });

  it('parseStravaArchiveCsv parses Strava activities.csv into normalized WorkoutRun items', () => {
    const csvContent = [
      'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Moving Time,Elevation Gain',
      '1000001,"Oct 28, 2026, 7:00:00 AM",Easy Morning Run,Run,"Felt good, easy pace",2400,10000,2300,50',
      '1000002,"Oct 29, 2026, 8:00:00 AM",Weight Training,Workout,"Leg day",1800,0,1800,0',
      '1000003,"Oct 30, 2026, 6:30:00 AM",Tempo 10k,Trail Run,"Tempo workout",2700,12000,2650,120',
    ].join('\n');

    const runs = parseStravaArchiveCsv(csvContent, 'mi', 'user_1', 'Michael Carey');

    // Should include Run and Trail Run, filtering out Workout
    expect(runs.length).toBe(2);

    const firstRun = runs[0];
    expect(firstRun.title).toBe('Easy Morning Run');
    expect(firstRun.workoutDate).toBe('2026-10-28');
    // 10000 meters = 6.21 miles
    expect(firstRun.distance).toBeCloseTo(6.21, 1);
    expect(firstRun.distanceUnit).toBe('mi');
    expect(firstRun.completed).toBe(true);
    expect(firstRun.source).toBe('strava');
    expect(firstRun.athleteId).toBe('user_1');
    expect(firstRun.athleteName).toBe('Michael Carey');
    expect(firstRun.durationSeconds).toBe(2300);

    const secondRun = runs[1];
    expect(secondRun.title).toBe('Tempo 10k');
    expect(secondRun.workoutDate).toBe('2026-10-30');
    // 12000 meters = 7.45 miles
    expect(secondRun.distance).toBeCloseTo(7.45, 1);
  });

  it('parseStravaArchiveZip extracts activities.csv from a zipped archive and returns runs', async () => {
    const zip = new JSZip();
    const csvContent = [
      'Activity ID,Activity Date,Activity Name,Activity Type,Moving Time,Distance',
      '2000001,"Nov 1, 2026, 9:00:00 AM",Sunday Long Run,Run,3600,16093.4',
    ].join('\n');

    zip.file('activities.csv', csvContent);
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const runs = await parseStravaArchiveZip(zipBuffer, 'mi', 'user_2', 'Rob Athlete');
    expect(runs.length).toBe(1);
    expect(runs[0].title).toBe('Sunday Long Run');
    expect(runs[0].workoutDate).toBe('2026-11-01');
    // 16093.4 meters = exactly 10.0 miles
    expect(runs[0].distance).toBeCloseTo(10.0, 1);
    expect(runs[0].athleteName).toBe('Rob Athlete');
  });

  it('parseDateToEpochSeconds parses 2026-01-01 and custom dates accurately', () => {
    const epoch = parseDateToEpochSeconds('2026-01-01');
    const date = new Date(epoch * 1000);
    // Buffer is 12 hours prior to ensure coverage across all global timezones
    expect(epoch).toBeGreaterThan(0);
    expect(date.getUTCFullYear()).toBe(2025); // 12h before 2026-01-01 UTC is 2025-12-31 12:00 UTC
  });

  it('fetchAllStravaActivitiesSince paginates when page 1 has non-run activities and returns sorted runs', async () => {
    const originalFetch = globalThis.fetch;
    const fetchUrls: string[] = [];
    const progressUpdates: Array<{ count: number; page: number }> = [];

    // Page 1: 200 items total: 185 Runs and 15 Hikes/Rides
    const page1Items: any[] = [];
    for (let i = 1; i <= 185; i++) {
      page1Items.push({
        id: 1000 + i,
        name: `Run ${i}`,
        type: 'Run',
        distance: 8000,
        moving_time: 2400,
        elapsed_time: 2500,
        start_date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z`,
        start_date_local: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T08:00:00`,
      });
    }
    for (let i = 1; i <= 15; i++) {
      page1Items.push({
        id: 2000 + i,
        name: `Hike ${i}`,
        type: 'Hike',
        distance: 5000,
        moving_time: 3600,
        elapsed_time: 4000,
        start_date: `2026-02-15T10:00:00Z`,
        start_date_local: `2026-02-15T10:00:00`,
      });
    }

    // Page 2: 30 items total: 25 Runs and 5 Rides
    const page2Items: any[] = [];
    for (let i = 1; i <= 25; i++) {
      page2Items.push({
        id: 3000 + i,
        name: `Recent Run ${i}`,
        type: 'Run',
        distance: 10000,
        moving_time: 3000,
        elapsed_time: 3100,
        start_date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T07:00:00Z`,
        start_date_local: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T07:00:00`,
      });
    }
    for (let i = 1; i <= 5; i++) {
      page2Items.push({
        id: 4000 + i,
        name: `Ride ${i}`,
        type: 'Ride',
        distance: 20000,
        moving_time: 3600,
        elapsed_time: 3700,
        start_date: `2026-05-10T12:00:00Z`,
        start_date_local: `2026-05-10T12:00:00`,
      });
    }

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      fetchUrls.push(urlStr);
      if (urlStr.includes('page=1')) {
        return {
          ok: true,
          status: 200,
          json: async () => page1Items,
        } as Response;
      }
      if (urlStr.includes('page=2')) {
        return {
          ok: true,
          status: 200,
          json: async () => page2Items,
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as Response;
    });

    try {
      const afterEpoch = 1700000000;
      const allRuns = await fetchAllStravaActivitiesSince(
        'mock_access_token',
        afterEpoch,
        undefined,
        (count, page) => {
          progressUpdates.push({ count, page });
        }
      );

      // Verify that pagination continued past page 1 even though page 1 had 185 runs (< 200)
      expect(fetchUrls.length).toBe(2);
      expect(fetchUrls[0]).toContain('page=1&per_page=200');
      expect(fetchUrls[1]).toContain('page=2&per_page=200');

      // Verify progress callback was invoked for both pages
      expect(progressUpdates.length).toBe(2);
      expect(progressUpdates[0]).toEqual({ count: 185, page: 1 });
      expect(progressUpdates[1]).toEqual({ count: 210, page: 2 });

      // Verify total runs collected is 185 (from page 1) + 25 (from page 2) = 210
      expect(allRuns.length).toBe(210);

      // Verify non-run activities were excluded
      expect(allRuns.every((r) => r.type === 'Run')).toBe(true);

      // Verify all activities are sorted by start_date descending (newest first)
      for (let i = 0; i < allRuns.length - 1; i++) {
        const timeCurrent = new Date(allRuns[i].start_date).getTime();
        const timeNext = new Date(allRuns[i + 1].start_date).getTime();
        expect(timeCurrent).toBeGreaterThanOrEqual(timeNext);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('syncWorkoutsFromCloud fetches coachView workouts and merges with local storage', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    const mockAthleteWorkouts = [
      {
        id: 'strava_9001',
        athleteId: 'runner_sarah',
        athleteName: 'Sarah Chen',
        workoutDate: '2026-10-31',
        runOrder: 1,
        distance: 7.5,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 1.0,
        load: 7.5,
        completed: true,
        title: 'Morning Strava Run',
        source: 'strava',
        durationSeconds: 2700,
        averageHeartRate: 145,
        paceSeconds: 360,
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({ workouts: mockAthleteWorkouts }),
      } as Response;
    });

    try {
      const result = await syncWorkoutsFromCloud(true);

      // Verify that coachView=true was passed
      expect(requestedUrl).toContain('/api/workouts?coachView=true');

      // Verify the athlete's Strava run was merged in
      const sarahRun = result.find((w) => w.id === 'strava_9001');
      expect(sarahRun).toBeDefined();
      expect(sarahRun?.athleteName).toBe('Sarah Chen');
      expect(sarahRun?.distance).toBe(7.5);
      expect(sarahRun?.averageHeartRate).toBe(145);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('syncWorkoutsFromCloud requests specific athleteId when athleteFilter is provided', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({ workouts: [] }),
      } as Response;
    });

    try {
      await syncWorkoutsFromCloud('runner_sarah');
      expect(requestedUrl).toContain('/api/workouts?athleteId=runner_sarah');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('encodeStravaOAuthState and decodeStravaOAuthState preserve athlete metadata across redirects', () => {
    const payload = {
      clientId: '291001',
      origin: 'https://hoprun.app',
      athleteId: 'user_1793482686680_2wma',
      athleteName: 'Elise Whisler',
      athleteEmail: 'elise.whisler@gmail.com',
    };
    const encoded = encodeStravaOAuthState(payload);
    expect(encoded).toBeTruthy();

    const decoded = decodeStravaOAuthState(encoded);
    expect(decoded?.athleteId).toBe('user_1793482686680_2wma');
    expect(decoded?.athleteName).toBe('Elise Whisler');
    expect(decoded?.athleteEmail).toBe('elise.whisler@gmail.com');
  });

  it('reconcileStravaWorkouts keeps runs for different athletes separate on the same calendar day', () => {
    const existingWorkouts: any[] = [
      {
        id: 'strava_m1',
        workoutDate: '2026-10-31',
        runOrder: 1,
        distance: 5.66,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 3,
        load: 17,
        comments: 'Synced via Strava (Garmin Forerunner 265)',
        completed: true,
        source: 'strava',
        athleteId: 'user_michael_carey',
        athleteName: 'Michael Carey',
      },
    ];

    const incomingWorkouts: any[] = [
      {
        id: 'strava_e1',
        workoutDate: '2026-10-31',
        runOrder: 1,
        distance: 12.02,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 3,
        load: 36.1,
        comments: 'Synced via Strava (Strava App)',
        completed: true,
        source: 'strava',
        athleteId: 'user_1793482686680_2wma',
        athleteName: 'Elise Whisler',
      },
      {
        id: 'strava_r1',
        workoutDate: '2026-10-31',
        runOrder: 1,
        distance: 3.94,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 3,
        load: 11.8,
        comments: 'Synced via Strava (Garmin Forerunner 955)',
        completed: true,
        source: 'strava',
        athleteId: 'user_1793563915467_10fr',
        athleteName: 'Robert Reynoso',
      },
    ];

    const result = reconcileStravaWorkouts(existingWorkouts, incomingWorkouts);

    expect(result.length).toBe(3);
    const michaelRuns = result.filter((w: any) => w.athleteId === 'user_michael_carey');
    const eliseRuns = result.filter((w: any) => w.athleteId === 'user_1793482686680_2wma');
    const robertRuns = result.filter((w: any) => w.athleteId === 'user_1793563915467_10fr');

    expect(michaelRuns.length).toBe(1);
    expect(eliseRuns.length).toBe(1);
    expect(robertRuns.length).toBe(1);

    expect(michaelRuns[0].distance).toBe(5.66);
    expect(eliseRuns[0].distance).toBe(12.02);
    expect(robertRuns[0].distance).toBe(3.94);
  });

  it('guarantees newly added athletes receive separate calendar workouts and dynamic ID resolution', () => {
    // Add a brand new runner to the roster
    const newAthlete = {
      id: 'user_new_runner_999',
      name: 'Taylor Swift',
      email: 'taylor@example.com',
      role: 'runner' as const,
    };
    addAthleteToRoster(newAthlete);

    // Incoming runs with the new athlete's name but missing athleteId
    const unassignedRuns = [
      {
        id: 'run_taylor_1',
        workoutDate: '2026-11-02',
        runOrder: 1,
        distance: 7.2,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 3,
        load: 21.6,
        comments: 'Morning track workout',
        completed: true,
        athleteName: 'Taylor Swift',
      },
      {
        id: 'run_michael_1',
        workoutDate: '2026-11-02',
        runOrder: 1,
        distance: 10,
        distanceUnit: 'mi',
        runType: 'easy',
        multiplier: 3,
        load: 30,
        comments: 'Easy miles',
        completed: true,
        athleteName: 'Michael Carey',
      },
    ];

    const sanitized = sanitizeLegacyWorkouts(unassignedRuns, [newAthlete]);
    expect(sanitized.length).toBe(2);

    const taylorRun = sanitized.find((w: any) => w.id === 'run_taylor_1');
    expect(taylorRun?.athleteId).toBe('user_new_runner_999');
    expect(taylorRun?.athleteName).toBe('Taylor Swift');

    const coachRun = sanitized.find((w: any) => w.id === 'run_michael_1');
    expect(coachRun?.athleteId).toBe('user_michael_carey');
    expect(coachRun?.athleteName).toBe('Michael Carey');
  });
});
