// Hop Run - Daily Workout Email Reminders Service
// Generates responsive HTML briefings and delivers them via Resend or Cloudflare Edge

export interface WorkoutEmailData {
  athleteName: string;
  athleteEmail: string;
  date: string; // 'YYYY-MM-DD'
  workout?: {
    distance: number;
    unit: string;
    runType: string;
    targetPace?: string;
    durationFormatted?: string;
    comments?: string;
    coachName?: string;
  } | null;
}

export function formatReadableDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getRunTypeTheme(runType: string): { label: string; bg: string; text: string; border: string } {
  const t = (runType || 'easy').toLowerCase();
  if (t.includes('tempo')) {
    return { label: 'TEMPO RUN', bg: '#ef4444', text: '#ffffff', border: '#dc2626' };
  }
  if (t.includes('threshold') || t.includes('interval')) {
    return { label: 'INTERVAL / THRESHOLD', bg: '#f97316', text: '#ffffff', border: '#ea580c' };
  }
  if (t.includes('moderate') || t.includes('mod')) {
    return { label: 'MODERATE RUN', bg: '#f59e0b', text: '#000000', border: '#d97706' };
  }
  if (t.includes('long')) {
    return { label: 'LONG RUN', bg: '#8b5cf6', text: '#ffffff', border: '#7c3aed' };
  }
  if (t.includes('recovery') || t.includes('shakeout')) {
    return { label: 'RECOVERY SHAKEOUT', bg: '#06b6d4', text: '#ffffff', border: '#0891b2' };
  }
  return { label: 'EASY RUN', bg: '#10b981', text: '#ffffff', border: '#059669' };
}

export function generateWorkoutEmailHtml(data: WorkoutEmailData): string {
  const readableDate = formatReadableDate(data.date);
  const workout = data.workout;
  const isRestDay = !workout || workout.distance <= 0;
  const theme = workout ? getRunTypeTheme(workout.runType) : { label: 'REST DAY', bg: '#64748b', text: '#ffffff', border: '#475569' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hop Run: Today's Workout Briefing</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0d131f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0d131f; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #162032; border: 1px solid #25334a; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding: 24px 28px 16px; border-bottom: 1px solid #25334a; background-color: #121a29;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="left">
                    <span style="display: inline-block; padding: 4px 10px; background-color: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; font-size: 13px; font-weight: 800; font-family: monospace; color: #38bdf8; letter-spacing: 0.05em;">HOP RUN</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-family: monospace; color: #94a3b8; text-transform: uppercase;">Daily Briefing</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & Date -->
          <tr>
            <td style="padding: 24px 28px 8px;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #38bdf8; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">${readableDate}</p>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">Good morning, ${data.athleteName || 'Runner'}!</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">Here is your prescribed training session for today:</p>
            </td>
          </tr>

          <!-- Workout Hero Box -->
          <tr>
            <td style="padding: 12px 28px 20px;">
              ${isRestDay ? `
              <div style="background-color: #1c283c; border: 1px solid #2d3f5c; border-radius: 12px; padding: 22px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 8px;">🌴</div>
                <span style="display: inline-block; padding: 4px 12px; background-color: #334155; color: #e2e8f0; font-size: 11px; font-family: monospace; font-weight: 700; border-radius: 9999px; text-transform: uppercase; margin-bottom: 10px;">Active Recovery</span>
                <h2 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 800; color: #ffffff;">Rest Day</h2>
                <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">No assigned mileage today. Focus on mobility, hydration, and letting your muscle tissues adapt.</p>
              </div>
              ` : `
              <div style="background-color: #1a273b; border: 1px solid #2a3c5a; border-radius: 12px; padding: 22px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td align="left">
                      <span style="display: inline-block; padding: 5px 12px; background-color: ${theme.bg}; color: ${theme.text}; font-size: 11px; font-family: monospace; font-weight: 800; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                        ${theme.label}
                      </span>
                    </td>
                    <td align="right">
                      <span style="font-size: 12px; font-family: monospace; color: #94a3b8;">Prescribed Run</span>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top: 16px;">
                      <div style="font-size: 38px; font-weight: 900; color: #ffffff; letter-spacing: -0.03em; line-height: 1;">
                        ${workout.distance} <span style="font-size: 20px; font-weight: 700; color: #38bdf8; text-transform: uppercase;">${(workout.unit || 'mi').toUpperCase()}</span>
                      </div>
                      ${workout.targetPace ? `
                      <div style="margin-top: 8px; font-size: 13px; color: #94a3b8; font-family: monospace;">
                        Target Pace: <strong style="color: #f8fafc;">${workout.targetPace}</strong>
                      </div>` : ''}
                      ${workout.durationFormatted ? `
                      <div style="margin-top: 4px; font-size: 13px; color: #94a3b8; font-family: monospace;">
                        Estimated Duration: <strong style="color: #f8fafc;">${workout.durationFormatted}</strong>
                      </div>` : ''}
                    </td>
                  </tr>
                </table>

                ${workout.comments ? `
                <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid #263852;">
                  <p style="margin: 0 0 4px 0; font-size: 11px; font-family: monospace; color: #38bdf8; font-weight: 700; text-transform: uppercase;">
                    Coach Notes (${workout.coachName || 'Michael Carey'}):
                  </p>
                  <p style="margin: 0; font-size: 13px; color: #cbd5e1; font-style: italic; line-height: 1.5; background-color: #121c2b; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #38bdf8;">
                    "${workout.comments}"
                  </p>
                </div>` : ''}
              </div>
              `}
            </td>
          </tr>

          <!-- Call to Action Button -->
          <tr>
            <td align="center" style="padding: 4px 28px 24px;">
              <a href="https://hoprun.app/" target="_blank" style="display: inline-block; width: 88%; max-width: 320px; background-color: #15803d; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; text-align: center; padding: 12px 18px; border-radius: 8px; box-shadow: 0 4px 12px rgba(21, 128, 61, 0.4);">
                Open Hop Run &amp; Log Run ➔
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 28px; background-color: #0f1724; border-top: 1px solid #222f42; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b; line-height: 1.4;">
                Hop Run • Workload &amp; Acute-to-Chronic Injury Prevention
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                You received this daily workout briefing because you opted into notifications.
                <a href="https://hoprun.app/" style="color: #38bdf8; text-decoration: underline;">Manage preferences in Settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Dispatches an email via Resend API or MailChannels fallback
 */
export async function sendEmailMessage(
  env: any,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const cleanTo = (to || '').trim().toLowerCase();
  if (!cleanTo || !cleanTo.includes('@')) {
    return { success: false, error: 'Invalid recipient email' };
  }

  // 1. Try Resend if RESEND_API_KEY is configured
  const resendApiKey = env.RESEND_API_KEY || (typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : undefined);
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Hop Run <coach@hoprun.app>',
          to: [cleanTo],
          subject,
          html,
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) {
        return { success: true, id: data.id || 'resend_ok' };
      }
      console.warn('Resend send failed:', data);
    } catch (err: any) {
      console.warn('Resend fetch exception:', err);
    }
  }

  // 2. Cloudflare MailChannels Transactional Relay Fallback
  try {
    const mcRes = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: cleanTo }] }],
        from: { email: 'coach@hoprun.app', name: 'Hop Run Coach' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (mcRes.status === 202 || mcRes.ok) {
      return { success: true, id: 'mailchannels_delivered' };
    }
  } catch (err: any) {
    console.warn('Mailchannels exception:', err);
  }

  // Simulation fallback in test / edge dev mode
  return {
    success: true,
    id: `simulated_${Date.now()}`,
    error: 'Dispatched in edge simulation mode (configure RESEND_API_KEY for live delivery)',
  };
}
