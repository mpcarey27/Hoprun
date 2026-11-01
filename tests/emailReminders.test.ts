import { describe, it, expect } from 'vitest';
import {
  formatReadableDate,
  getRunTypeTheme,
  generateWorkoutEmailHtml,
  sendEmailMessage,
  type WorkoutEmailData,
} from '../functions/emailService';

describe('Daily Workout Email Reminders (TDD)', () => {
  it('formatReadableDate() formats YYYY-MM-DD into human-readable date', () => {
    // 2026-11-01 is Sunday, Nov 1, 2026
    const formatted = formatReadableDate('2026-11-01');
    expect(formatted).toContain('Sunday');
    expect(formatted).toContain('Nov');
    expect(formatted).toContain('1');
    expect(formatted).toContain('2026');
  });

  it('getRunTypeTheme() assigns accurate color badges for easy and moderate runs', () => {
    const easy = getRunTypeTheme('easy');
    expect(easy.label).toBe('EASY RUN');
    expect(easy.bg).toBe('#10b981');

    const moderate = getRunTypeTheme('moderate');
    expect(moderate.label).toBe('MODERATE RUN');
    expect(moderate.bg).toBe('#f59e0b');

    const tempo = getRunTypeTheme('tempo');
    expect(tempo.label).toBe('TEMPO RUN');

    const longRun = getRunTypeTheme('long');
    expect(longRun.label).toBe('LONG RUN');
  });

  it('generateWorkoutEmailHtml() generates Sunday 8-mile Easy Run with coach comments', () => {
    const emailData: WorkoutEmailData = {
      athleteName: 'Rob',
      athleteEmail: 'rob@example.com',
      date: '2026-11-01',
      workout: {
        distance: 8,
        unit: 'mi',
        runType: 'easy',
        targetPace: '7:45 - 8:00 /mi',
        comments: 'Keep heart rate in zone 2. Easy conversational effort.',
        coachName: 'Michael Carey',
      },
    };

    const html = generateWorkoutEmailHtml(emailData);

    expect(html).toContain('Good morning, Rob!');
    expect(html).toContain('8');
    expect(html).toContain('MI');
    expect(html).toContain('EASY RUN');
    expect(html).toContain('Keep heart rate in zone 2. Easy conversational effort.');
    expect(html).toContain('Coach Notes (Michael Carey):');
    expect(html).toContain('Open Hop Run');
  });

  it('generateWorkoutEmailHtml() generates Monday 10-mile Moderate Run with coach comments', () => {
    const emailData: WorkoutEmailData = {
      athleteName: 'Elise Whisler',
      athleteEmail: 'elise@example.com',
      date: '2026-11-02',
      workout: {
        distance: 10,
        unit: 'mi',
        runType: 'moderate',
        targetPace: '7:15 /mi',
        durationFormatted: '1:12:30',
        comments: 'Comfortably hard progression on the final 3 miles.',
        coachName: 'Michael Carey',
      },
    };

    const html = generateWorkoutEmailHtml(emailData);

    expect(html).toContain('Good morning, Elise Whisler!');
    expect(html).toContain('10');
    expect(html).toContain('MODERATE RUN');
    expect(html).toContain('Target Pace:');
    expect(html).toContain('7:15 /mi');
    expect(html).toContain('Comfortably hard progression on the final 3 miles.');
  });

  it('generateWorkoutEmailHtml() handles rest days gracefully', () => {
    const emailData: WorkoutEmailData = {
      athleteName: 'Michael Carey',
      athleteEmail: 'careyer1234@gmail.com',
      date: '2026-11-03',
      workout: null,
    };

    const html = generateWorkoutEmailHtml(emailData);

    expect(html).toContain('Rest Day');
    expect(html).toContain('Active Recovery');
    expect(html).toContain('No assigned mileage today');
  });

  it('sendEmailMessage() validates invalid email and dispatches edge fallback when no API key configured', async () => {
    // Invalid email
    const invalidRes = await sendEmailMessage({}, '', 'Subject', '<p>test</p>');
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toContain('Invalid recipient email');

    // Valid email with simulated edge fallback
    const validRes = await sendEmailMessage(
      {},
      'runner@hoprun.app',
      "Today's Workout Briefing",
      '<h1>Briefing</h1>'
    );
    expect(validRes.success).toBe(true);
    expect(validRes.id).toBeTruthy();
  });
});
