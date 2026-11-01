import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  DEFAULT_MASTER_STRAVA_CLIENT_ID,
  parseCsvLine,
  parseStravaArchiveCsv,
  parseStravaArchiveZip,
  buildStravaAuthUrl,
  parseDateToEpochSeconds,
} from '../src/utils/stravaSync';

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
});
