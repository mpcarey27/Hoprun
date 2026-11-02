import { describe, it, expect } from 'vitest';
import {
  formatReadableDate,
  formatDayHeader,
  formatWeekDateRange,
  getRunTypeTheme,
  generateWeeklyPlanEmailHtml,
  type WeeklyPlanDayData,
  type WeeklyPlanEmailData,
} from '../functions/emailService';
import {
  calculateMondayDate,
  getWeekDatesFromMonday,
} from '../functions/api/[[route]]';

describe('Monday Weekly Training Plan Email (TDD)', () => {
  describe('Date Helpers', () => {
    it('formatWeekDateRange() formats same-month and cross-month week boundaries', () => {
      // Same month: Nov 2, 2026 to Nov 8, 2026
      const sameMonth = formatWeekDateRange('2026-11-02', '2026-11-08');
      expect(sameMonth).toContain('Nov 2');
      expect(sameMonth).toContain('8');
      expect(sameMonth).toContain('2026');

      // Cross month: Oct 26, 2026 to Nov 1, 2026
      const crossMonth = formatWeekDateRange('2026-10-26', '2026-11-01');
      expect(crossMonth).toContain('Oct 26');
      expect(crossMonth).toContain('Nov 1');
      expect(crossMonth).toContain('2026');
    });

    it('formatDayHeader() formats YYYY-MM-DD into "Day, Month Date"', () => {
      const formatted = formatDayHeader('2026-11-02');
      expect(formatted).toContain('Monday');
      expect(formatted).toContain('Nov');
      expect(formatted).toContain('2');
    });

    it('calculateMondayDate() calculates the correct Monday for any day of the week', () => {
      // Monday Nov 2, 2026 -> returns 2026-11-02
      expect(calculateMondayDate(new Date(2026, 10, 2))).toBe('2026-11-02');
      // Wednesday Nov 4, 2026 -> returns 2026-11-02
      expect(calculateMondayDate(new Date(2026, 10, 4))).toBe('2026-11-02');
      // Sunday Nov 8, 2026 -> returns 2026-11-02
      expect(calculateMondayDate(new Date(2026, 10, 8))).toBe('2026-11-02');
      // Sunday Nov 1, 2026 -> returns 2026-10-26
      expect(calculateMondayDate(new Date(2026, 10, 1))).toBe('2026-10-26');
    });

    it('getWeekDatesFromMonday() generates exactly 7 sequential dates Monday through Sunday', () => {
      const dates = getWeekDatesFromMonday('2026-11-02');
      expect(dates).toHaveLength(7);
      expect(dates[0]).toBe('2026-11-02'); // Monday
      expect(dates[1]).toBe('2026-11-03'); // Tuesday
      expect(dates[2]).toBe('2026-11-04'); // Wednesday
      expect(dates[3]).toBe('2026-11-05'); // Thursday
      expect(dates[4]).toBe('2026-11-06'); // Friday
      expect(dates[5]).toBe('2026-11-07'); // Saturday
      expect(dates[6]).toBe('2026-11-08'); // Sunday
    });
  });

  describe('generateWeeklyPlanEmailHtml()', () => {
    const fullWeekDays: WeeklyPlanDayData[] = [
      {
        date: '2026-11-02',
        dayName: 'Monday',
        distance: 6,
        unit: 'mi',
        runType: 'easy',
        targetPace: '7:45 - 8:00 /mi',
        durationFormatted: '47:30',
        comments: 'Start the week aerobic and controlled.',
      },
      {
        date: '2026-11-03',
        dayName: 'Tuesday',
        distance: 8,
        unit: 'mi',
        runType: 'tempo',
        targetPace: '6:40 /mi',
        durationFormatted: '58:00',
        comments: '4 miles continuous tempo in the middle.',
      },
      {
        date: '2026-11-04',
        dayName: 'Wednesday',
        distance: 0,
        unit: 'mi',
        runType: 'rest',
        comments: 'Light foam rolling and 15 min mobility.',
      },
      {
        date: '2026-11-05',
        dayName: 'Thursday',
        distance: 7,
        unit: 'mi',
        runType: 'moderate',
        targetPace: '7:15 /mi',
        durationFormatted: '50:45',
        comments: 'Comfortably hard progression.',
      },
      {
        date: '2026-11-06',
        dayName: 'Friday',
        distance: 4,
        unit: 'mi',
        runType: 'recovery',
        targetPace: '8:15 /mi',
        durationFormatted: '33:00',
        comments: 'Easy shakeout before weekend volume.',
      },
      {
        date: '2026-11-07',
        dayName: 'Saturday',
        distance: 14,
        unit: 'mi',
        runType: 'long',
        targetPace: '7:30 /mi',
        durationFormatted: '1:45:00',
        comments: 'Practice marathon hydration at miles 5 and 10.',
      },
      {
        date: '2026-11-08',
        dayName: 'Sunday',
        distance: 0,
        unit: 'mi',
        runType: 'rest',
      },
    ];

    it('renders branding, greeting, and date range in responsive dark-mode styling', () => {
      const emailData: WeeklyPlanEmailData = {
        athleteName: 'Elise Whisler',
        athleteEmail: 'elise@example.com',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 39,
        unit: 'mi',
        coachName: 'Michael Carey',
        days: fullWeekDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      // Dark mode palette
      expect(html).toContain('#0d131f');
      expect(html).toContain('#162032');
      expect(html).toContain('#25334a');

      // Brand headers
      expect(html).toContain('HOP RUN');
      expect(html).toContain('WEEKLY TRAINING ROADMAP');

      // Personalized greeting
      expect(html).toContain('Good morning, Elise Whisler!');
      expect(html).toContain('Nov 2');
      expect(html).toContain('8');
    });

    it('renders 3-column metric cards with total volume, runs count, and rest days count', () => {
      const emailData: WeeklyPlanEmailData = {
        athleteName: 'Rob',
        athleteEmail: 'rob@example.com',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 39,
        unit: 'mi',
        days: fullWeekDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      // Total Volume
      expect(html).toContain('TOTAL VOLUME');
      expect(html).toContain('39');
      expect(html).toContain('MI');

      // Sessions (5 active runs)
      expect(html).toContain('SESSIONS');
      expect(html).toContain('5');
      expect(html).toContain('RUNS');

      // Rest Days (2 rest days)
      expect(html).toContain('REST DAYS');
      expect(html).toContain('2');
      expect(html).toContain('DAYS');
    });

    it('renders Monday-to-Sunday cards with color-coded run type badges and coach comments', () => {
      const emailData: WeeklyPlanEmailData = {
        athleteName: 'Michael',
        athleteEmail: 'careyer1234@gmail.com',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 39,
        unit: 'mi',
        days: fullWeekDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      // Run type badges
      expect(html).toContain('EASY RUN');
      expect(html).toContain('TEMPO RUN');
      expect(html).toContain('REST DAY');
      expect(html).toContain('MODERATE RUN');
      expect(html).toContain('RECOVERY SHAKEOUT');
      expect(html).toContain('LONG RUN');

      // Distances
      expect(html).toContain('14');
      expect(html).toContain('Target Pace:');
      expect(html).toContain('6:40 /mi');
      expect(html).toContain('Duration:');
      expect(html).toContain('1:45:00');

      // Coach notes
      expect(html).toContain('Start the week aerobic and controlled.');
      expect(html).toContain('Practice marathon hydration at miles 5 and 10.');
    });

    it('renders CTA button, daily briefing continuation note, and footer', () => {
      const emailData: WeeklyPlanEmailData = {
        athleteName: 'Runner',
        athleteEmail: 'runner@hoprun.app',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 39,
        unit: 'mi',
        days: fullWeekDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      // CTA Button
      expect(html).toContain('Open Hop Run &amp; View Training Plan ➔');
      expect(html).toContain('https://hoprun.app/');

      // Continuation note
      expect(html).toContain('You will also continue to receive your daily morning briefing on each specific day.');

      // Footer
      expect(html).toContain('Hop Run &bull; Workload &amp; Acute-to-Chronic Injury Prevention');
      expect(html).toContain('Manage preferences in Settings');
    });

    it('handles rest weeks / recovery weeks gracefully (0 total miles)', () => {
      const restDays: WeeklyPlanDayData[] = [
        { date: '2026-11-02', dayName: 'Monday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-03', dayName: 'Tuesday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-04', dayName: 'Wednesday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-05', dayName: 'Thursday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-06', dayName: 'Friday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-07', dayName: 'Saturday', distance: 0, unit: 'mi', runType: 'rest' },
        { date: '2026-11-08', dayName: 'Sunday', distance: 0, unit: 'mi', runType: 'rest' },
      ];

      const emailData: WeeklyPlanEmailData = {
        athleteName: '',
        athleteEmail: 'rest@example.com',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 0,
        unit: 'mi',
        days: restDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      expect(html).toContain('Good morning, Runner!');
      expect(html).toContain('0');
      expect(html).toContain('7');
      expect(html).toContain('DAYS');
      expect(html).toContain('Rest &amp; Recovery');
    });

    it('supports metric kilometers unit formatting', () => {
      const kmDays: WeeklyPlanDayData[] = [
        { date: '2026-11-02', dayName: 'Monday', distance: 10, unit: 'km', runType: 'easy' },
        { date: '2026-11-03', dayName: 'Tuesday', distance: 12.5, unit: 'km', runType: 'tempo' },
      ];

      const emailData: WeeklyPlanEmailData = {
        athleteName: 'International Runner',
        athleteEmail: 'km@example.com',
        weekStartDate: '2026-11-02',
        weekEndDate: '2026-11-08',
        totalDistance: 22.5,
        unit: 'km',
        days: kmDays,
      };

      const html = generateWeeklyPlanEmailHtml(emailData);

      expect(html).toContain('22.5');
      expect(html).toContain('KM');
    });
  });
});
