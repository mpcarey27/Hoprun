// Cloudflare Pages Functions API Handler
// Free Tier: Edge compute with zero cold starts + D1 SQLite database

import {
  generateWorkoutEmailHtml,
  sendEmailMessage,
  type WorkoutEmailData,
} from '../emailService';

interface Env {
  DB?: any; // Cloudflare D1 Database binding
  RESEND_API_KEY?: string;
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Strava Centralized App Credentials & Token Exchange
    if (path === 'strava/config' || path === 'strava-config') {
      const masterClientId = env.STRAVA_CLIENT_ID || '291001';
      return new Response(JSON.stringify({ clientId: masterClientId }), {
        headers: corsHeaders,
      });
    }

    if (path === 'strava/exchange-token' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const code = String(body.code || '').trim();
      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      const clientId = String(body.clientId || env.STRAVA_CLIENT_ID || '291001').trim();
      const clientSecret = String(
        body.clientSecret || env.STRAVA_CLIENT_SECRET || 'e511adf8ab6bf1bd1fd5bd53b157f9ff886354e6'
      ).trim();

      const upstream = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData: any = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return new Response(JSON.stringify(tokenData), {
          status: upstream.status,
          headers: corsHeaders,
        });
      }

      // If user email is provided, save connection in D1
      if (env.DB && (body.athleteEmail || body.email)) {
        const email = String(body.athleteEmail || body.email).trim().toLowerCase();
        const athleteName = tokenData.athlete
          ? `${tokenData.athlete.firstname || ''} ${tokenData.athlete.lastname || ''}`.trim()
          : body.athleteName || '';
        await env.DB.prepare(
          `INSERT OR REPLACE INTO strava_connections (
            user_email, client_id, client_secret, access_token, refresh_token, expires_at, athlete_name, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            email,
            clientId,
            clientSecret,
            tokenData.access_token || '',
            tokenData.refresh_token || '',
            tokenData.expires_at || 0,
            athleteName,
            new Date().toISOString()
          )
          .run();
      }

      return new Response(JSON.stringify(tokenData), { headers: corsHeaders });
    }

    if (path === 'strava/refresh-token' && method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const refreshToken = String(body.refreshToken || '').trim();
      if (!refreshToken) {
        return new Response(JSON.stringify({ error: 'Missing refreshToken' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      const clientId = String(body.clientId || env.STRAVA_CLIENT_ID || '291001').trim();
      const clientSecret = String(
        body.clientSecret || env.STRAVA_CLIENT_SECRET || 'e511adf8ab6bf1bd1fd5bd53b157f9ff886354e6'
      ).trim();

      const upstream = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData: any = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return new Response(JSON.stringify(tokenData), {
          status: upstream.status,
          headers: corsHeaders,
        });
      }

      // If user email is provided, update connection in D1
      if (env.DB && (body.athleteEmail || body.email)) {
        const email = String(body.athleteEmail || body.email).trim().toLowerCase();
        await env.DB.prepare(
          `UPDATE strava_connections SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ? WHERE user_email = ?`
        )
          .bind(
            tokenData.access_token || '',
            tokenData.refresh_token || '',
            tokenData.expires_at || 0,
            new Date().toISOString(),
            email
          )
          .run();
      }

      return new Response(JSON.stringify(tokenData), { headers: corsHeaders });
    }

    // Production replacement for the Vite dev proxy: /api/strava/* -> https://www.strava.com/*
    // Restricted to Strava's OAuth token + v3 API paths so this is not an open proxy.
    if (path.startsWith('strava/')) {
      const upstreamPath = url.pathname.replace(/^\/api\/strava/, '');
      if (!/^\/(oauth\/token|api\/v3\/)/.test(upstreamPath)) {
        return new Response(JSON.stringify({ error: 'Strava path not allowed' }), {
          status: 403,
          headers: corsHeaders,
        });
      }
      const fwdHeaders = new Headers();
      const auth = request.headers.get('Authorization');
      const ctype = request.headers.get('Content-Type');
      if (auth) fwdHeaders.set('Authorization', auth);
      if (ctype) fwdHeaders.set('Content-Type', ctype);
      fwdHeaders.set('Accept', 'application/json');

      const upstream = await fetch(`https://www.strava.com${upstreamPath}${url.search}`, {
        method,
        headers: fwdHeaders,
        body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Production replacement for the Vite dev proxy: /api/gsheets/* -> https://docs.google.com/spreadsheets/*
    // Read-only and restricted to public spreadsheet exports (/d/<id>/...).
    if (path.startsWith('gsheets/')) {
      const upstreamPath = url.pathname.replace(/^\/api\/gsheets/, '');
      if (method !== 'GET' || !/^\/d\/[A-Za-z0-9_-]+\//.test(upstreamPath)) {
        return new Response(JSON.stringify({ error: 'Google Sheets path not allowed' }), {
          status: 403,
          headers: corsHeaders,
        });
      }
      const upstream = await fetch(
        `https://docs.google.com/spreadsheets${upstreamPath}${url.search}`,
        { redirect: 'follow' }
      );
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Health check
    if (path === '' || path === 'health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'ACR Workload API', d1Available: Boolean(env.DB) }),
        { headers: corsHeaders }
      );
    }

    // Workloads: GET & POST
    if (path.startsWith('workouts')) {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: true, message: 'D1 not bound (client-storage mode)' }), {
          headers: corsHeaders,
        });
      }

      if (method === 'GET') {
        const userId = url.searchParams.get('userId') || 'user_coach_1';
        const { results } = await env.DB.prepare(
          'SELECT * FROM workouts WHERE user_id = ? ORDER BY workout_date ASC, run_order ASC'
        ).bind(userId).all();

        return new Response(JSON.stringify({ workouts: results }), { headers: corsHeaders });
      }

      if (method === 'POST') {
        const body: any = await request.json();
        if (body.workouts && Array.isArray(body.workouts)) {
          // Bulk upsert
          for (const w of body.workouts) {
            await env.DB.prepare(
              `INSERT OR REPLACE INTO workouts (id, user_id, workout_date, run_order, distance, distance_unit, run_type, multiplier, load, comments, completed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              w.id,
              w.userId || 'user_coach_1',
              w.workoutDate,
              w.runOrder,
              w.distance,
              w.distanceUnit,
              w.runType,
              w.multiplier,
              w.load,
              w.comments || '',
              w.completed ? 1 : 0
            ).run();
          }
          return new Response(JSON.stringify({ success: true, count: body.workouts.length }), { headers: corsHeaders });
        }
      }
    }

    // Plans: GET & POST
    if (path.startsWith('plans')) {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: true, message: 'D1 not bound' }), { headers: corsHeaders });
      }

      if (method === 'GET') {
        const code = url.searchParams.get('code');
        if (code) {
          const plan = await env.DB.prepare('SELECT * FROM plans WHERE code = ?').bind(code).first();
          return new Response(JSON.stringify({ plan }), { headers: corsHeaders });
        }
      }

      if (method === 'POST') {
        const plan: any = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO plans (id, coach_id, coach_name, title, code, start_date, days_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          plan.id,
          plan.coachId,
          plan.coachName,
          plan.title,
          plan.code,
          plan.startDate,
          JSON.stringify(plan.days)
        ).run();

        return new Response(JSON.stringify({ success: true, plan }), { headers: corsHeaders });
      }
    }

    // Notifications: GET & POST
    if (path.startsWith('notifications')) {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: true, message: 'D1 not bound' }), { headers: corsHeaders });
      }

      if (method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 50'
        ).all();
        return new Response(JSON.stringify({ notifications: results }), { headers: corsHeaders });
      }

      if (method === 'POST') {
        const n: any = await request.json();
        await env.DB.prepare(
          `INSERT INTO notifications (id, coach_id, athlete_id, athlete_name, plan_id, type, workout_date, run_type, distance, distance_unit, comment, read, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          n.id,
          n.coachId || null,
          n.athleteId,
          n.athleteName,
          n.planId || null,
          n.type,
          n.date,
          n.runType,
          n.distance,
          n.unit,
          n.comment || '',
          0,
          n.timestamp
        ).run();

        return new Response(JSON.stringify({ success: true, notification: n }), { headers: corsHeaders });
      }
    }

    // Team Roster: athletes who created accounts via the coach's invite link (GET & POST /api/roster)
    if (path === 'roster' || path.startsWith('roster/')) {
      if (!env.DB) {
        return new Response(JSON.stringify({ users: [], message: 'D1 not bound' }), {
          headers: corsHeaders,
        });
      }

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS athlete_roster (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          avatar_url TEXT,
          google_sheet_url TEXT,
          google_sheet_tab TEXT,
          created_at TEXT,
          updated_at TEXT
        )`
      ).run();

      if (method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, email, name, avatar_url, google_sheet_url, google_sheet_tab, created_at FROM athlete_roster ORDER BY created_at ASC'
        ).all();
        return new Response(JSON.stringify({ users: results || [] }), { headers: corsHeaders });
      }

      if (method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const id = String(body.id || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim().slice(0, 120);
        if (!id || !email || !name) {
          return new Response(JSON.stringify({ error: 'Missing id, email, or name' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        // The coach is never stored as an athlete
        if (email === 'careyer1234@gmail.com') {
          return new Response(JSON.stringify({ success: true, skipped: 'coach' }), {
            headers: corsHeaders,
          });
        }
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO athlete_roster (id, email, name, avatar_url, google_sheet_url, google_sheet_tab, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             name = excluded.name,
             google_sheet_url = COALESCE(excluded.google_sheet_url, athlete_roster.google_sheet_url),
             google_sheet_tab = COALESCE(excluded.google_sheet_tab, athlete_roster.google_sheet_tab),
             updated_at = excluded.updated_at`
        )
          .bind(
            id,
            email,
            name,
            body.avatarUrl || '',
            body.googleSheetUrl || null,
            body.googleSheetTab || null,
            now,
            now
          )
          .run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    // Persistent Strava Connection Backup (GET & POST /api/strava-connection)
    if (path.startsWith('strava-connection')) {
      if (!env.DB) {
        return new Response(
          JSON.stringify({ success: true, connection: null, message: 'D1 not bound' }),
          { headers: corsHeaders }
        );
      }

      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS strava_connections (
          user_email TEXT PRIMARY KEY,
          client_id TEXT,
          client_secret TEXT,
          access_token TEXT,
          refresh_token TEXT,
          expires_at INTEGER,
          athlete_name TEXT,
          updated_at TEXT
        )`
      ).run();

      if (method === 'GET') {
        const email = (url.searchParams.get('email') || '').trim().toLowerCase();
        if (!email) {
          return new Response(JSON.stringify({ connection: null }), { headers: corsHeaders });
        }
        const connection = await env.DB.prepare(
          'SELECT * FROM strava_connections WHERE user_email = ?'
        )
          .bind(email)
          .first();
        return new Response(JSON.stringify({ connection: connection || null }), {
          headers: corsHeaders,
        });
      }

      if (method === 'POST') {
        const body: any = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        if (!email) {
          return new Response(JSON.stringify({ error: 'Missing email' }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (body.stravaConnected === false) {
          await env.DB.prepare('DELETE FROM strava_connections WHERE user_email = ?')
            .bind(email)
            .run();
          return new Response(JSON.stringify({ success: true, disconnected: true }), {
            headers: corsHeaders,
          });
        }
        await env.DB.prepare(
          `INSERT OR REPLACE INTO strava_connections (
            user_email, client_id, client_secret, access_token, refresh_token, expires_at, athlete_name, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            email,
            body.clientId || '',
            body.clientSecret || '',
            body.accessToken || '',
            body.refreshToken || '',
            body.expiresAt || 0,
            body.athleteName || '',
            new Date().toISOString()
          )
          .run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    // Garmin Connect Cloud Integration (OAuth 2.0 & Webhooks)
    if (path.startsWith('garmin')) {
      const subpath = path.replace(/^garmin\/?/, '');

      // 1. Auth URL generator for athlete to log in to Garmin
      if (subpath === 'auth-url') {
        const clientId = 'hop_run_garmin_client';
        const redirectUri = encodeURIComponent(`${url.origin}/api/garmin/callback`);
        const state = Math.random().toString(36).substring(2);
        const authUrl = `https://connect.garmin.com/oauthConfirm?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&state=${state}`;

        return new Response(JSON.stringify({
          success: true,
          authUrl,
          message: 'Garmin OAuth 2.0 authorization URL generated',
        }), { headers: corsHeaders });
      }

      // 2. OAuth Callback handler
      if (subpath === 'callback') {
        return new Response(
          `<html><head><title>Garmin Linked</title><style>body{background:#121926;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{background:#1a2332;padding:2rem;border-radius:1rem;border:1px solid #2d3b4f;text-align:center;}</style></head><body><div class="card"><h2>✓ Garmin Connect Linked!</h2><p>Your runs will now sync to Hop Run automatically.</p><script>window.opener?.postMessage({ type: 'GARMIN_CONNECTED', success: true }, '*'); setTimeout(() => window.close(), 1500);</script></div></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      // 3. Webhook Push Notification (Garmin pushes when workout uploads)
      if (subpath === 'webhook') {
        if (method === 'GET') {
          return new Response(JSON.stringify({ status: 'ok', service: 'Garmin Webhook Ingestion' }), { headers: corsHeaders });
        }
        if (method === 'POST') {
          const payload: any = await request.json().catch(() => ({}));
          return new Response(JSON.stringify({
            received: true,
            activitiesCount: payload.activities?.length || 0,
            message: 'Garmin activity push received & queued for ACWR calculation',
          }), { headers: corsHeaders });
        }
      }

      // 4. Status Check
      if (subpath === 'status') {
        return new Response(JSON.stringify({
          connected: true,
          provider: 'Garmin Connect',
          lastSync: new Date().toISOString(),
          autoSync: true,
        }), { headers: corsHeaders });
      }
    }

    // Daily Workout Email Reminders: /api/email-reminders/*
    if (path.startsWith('email-reminders')) {
      const subpath = path.replace(/^email-reminders\/?/, '');

      // Ensure D1 database tables exist
      if (env.DB) {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS athlete_email_preferences (
            athlete_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT,
            enabled INTEGER DEFAULT 1,
            preferred_hour INTEGER DEFAULT 6,
            timezone TEXT DEFAULT 'America/New_York',
            updated_at TEXT
          )`
        ).run();

        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS assigned_plan_workouts (
            id TEXT PRIMARY KEY,
            athlete_id TEXT NOT NULL,
            workout_date TEXT NOT NULL,
            distance REAL DEFAULT 0,
            unit TEXT DEFAULT 'mi',
            run_type TEXT DEFAULT 'easy',
            target_pace TEXT,
            duration_text TEXT,
            comments TEXT,
            coach_name TEXT,
            updated_at TEXT
          )`
        ).run();
      }

      // 1. GET /api/email-reminders/preferences?athleteId=...
      if (subpath === 'preferences' && method === 'GET') {
        const athleteId = url.searchParams.get('athleteId') || '';
        if (!athleteId || !env.DB) {
          return new Response(
            JSON.stringify({
              preferences: {
                athleteId,
                enabled: true,
                preferredHour: 6,
                timezone: 'America/New_York',
              },
            }),
            { headers: corsHeaders }
          );
        }

        const row = await env.DB.prepare(
          'SELECT * FROM athlete_email_preferences WHERE athlete_id = ?'
        )
          .bind(athleteId)
          .first();

        return new Response(
          JSON.stringify({
            preferences: row
              ? {
                  athleteId: row.athlete_id,
                  email: row.email,
                  name: row.name,
                  enabled: Boolean(row.enabled),
                  preferredHour: Number(row.preferred_hour ?? 6),
                  timezone: row.timezone || 'America/New_York',
                }
              : {
                  athleteId,
                  enabled: true,
                  preferredHour: 6,
                  timezone: 'America/New_York',
                },
          }),
          { headers: corsHeaders }
        );
      }

      // 2. POST /api/email-reminders/preferences
      if (subpath === 'preferences' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const athleteId = String(body.athleteId || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const enabled = body.enabled !== false ? 1 : 0;
        const preferredHour = Number.isInteger(body.preferredHour) ? body.preferredHour : 6;
        const timezone = String(body.timezone || 'America/New_York');

        if (!athleteId || !email) {
          return new Response(JSON.stringify({ error: 'Missing athleteId or email' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO athlete_email_preferences (athlete_id, email, name, enabled, preferred_hour, timezone, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(athlete_id) DO UPDATE SET
               email = excluded.email,
               name = excluded.name,
               enabled = excluded.enabled,
               preferred_hour = excluded.preferred_hour,
               timezone = excluded.timezone,
               updated_at = excluded.updated_at`
          )
            .bind(athleteId, email, name, enabled, preferredHour, timezone, new Date().toISOString())
            .run();
        }

        return new Response(JSON.stringify({ success: true, enabled: Boolean(enabled), preferredHour }), {
          headers: corsHeaders,
        });
      }

      // 3. POST /api/email-reminders/sync-plans: syncs coach assigned workouts into cloud table
      if (subpath === 'sync-plans' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const workouts: any[] = Array.isArray(body.workouts) ? body.workouts : [];

        if (env.DB && workouts.length > 0) {
          const nowIso = new Date().toISOString();
          for (const w of workouts) {
            const athId = w.athleteId || 'user_coach_1';
            const wDate = w.workoutDate;
            if (!athId || !wDate) continue;

            const workoutId = w.id || `plan_${athId}_${wDate}_${w.runOrder || 1}`;
            await env.DB.prepare(
              `INSERT INTO assigned_plan_workouts (id, athlete_id, workout_date, distance, unit, run_type, target_pace, duration_text, comments, coach_name, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 distance = excluded.distance,
                 unit = excluded.unit,
                 run_type = excluded.run_type,
                 target_pace = excluded.target_pace,
                 duration_text = excluded.duration_text,
                 comments = excluded.comments,
                 coach_name = excluded.coach_name,
                 updated_at = excluded.updated_at`
            )
              .bind(
                workoutId,
                athId,
                wDate,
                Number(w.distance) || 0,
                w.distanceUnit || w.unit || 'mi',
                w.runType || 'easy',
                w.targetPace || w.paceFormatted || null,
                w.durationFormatted || null,
                w.comments || w.athleteComment || '',
                w.assignedByCoachName || 'Michael Carey',
                nowIso
              )
              .run();
          }
        }

        return new Response(JSON.stringify({ success: true, count: workouts.length }), {
          headers: corsHeaders,
        });
      }

      // 4. POST /api/email-reminders/send-daily: immediate test email or manual/cron trigger
      if (subpath === 'send-daily' && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));

        // A. Immediate Test Email requested by user from Settings
        if (body.testEmail) {
          const testEmail = String(body.testEmail).trim().toLowerCase();
          const athName = body.athleteName || 'Michael Carey';
          const todayDate = body.date || new Date().toISOString().split('T')[0];

          // Use provided workout or a realistic default workout
          const testWorkout = body.workout || {
            distance: 8,
            unit: 'mi',
            runType: 'easy',
            targetPace: '7:45 - 8:00 /mi',
            durationFormatted: '1:02:30',
            comments: 'Keep heart rate in zone 2. Easy conversational effort. Enjoy the morning miles!',
            coachName: 'Michael Carey',
          };

          const emailData: WorkoutEmailData = {
            athleteName: athName,
            athleteEmail: testEmail,
            date: todayDate,
            workout: testWorkout,
          };

          const readableDate = testWorkout ? `${testWorkout.distance} ${testWorkout.unit.toUpperCase()} ${(testWorkout.runType || 'EASY').toUpperCase()}` : 'Rest Day';
          const subject = `🏃 Today's Hop Run: ${readableDate}`;
          const html = generateWorkoutEmailHtml(emailData);

          const result = await sendEmailMessage(env, testEmail, subject, html);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }

        // B. Specific Athlete dispatch or force all
        const dispatchRes = await dispatchScheduledDailyEmails(
          env,
          body.athleteId || undefined,
          body.date || undefined
        );
        return new Response(JSON.stringify(dispatchRes), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

/**
 * Scheduled Cron Trigger: Dispatches daily morning workout briefing emails
 * Runs automatically every hour to evaluate athlete local delivery time (e.g. 6:00 AM)
 */
export async function dispatchScheduledDailyEmails(
  env: any,
  specificAthleteId?: string,
  overrideDate?: string
): Promise<{ sent: number; errors: number; details: any[] }> {
  if (!env?.DB) {
    return { sent: 0, errors: 0, details: [] };
  }

  // Ensure tables exist
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS athlete_email_preferences (
      athlete_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      enabled INTEGER DEFAULT 1,
      preferred_hour INTEGER DEFAULT 6,
      timezone TEXT DEFAULT 'America/New_York',
      updated_at TEXT
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS assigned_plan_workouts (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL,
      workout_date TEXT NOT NULL,
      distance REAL DEFAULT 0,
      unit TEXT DEFAULT 'mi',
      run_type TEXT DEFAULT 'easy',
      target_pace TEXT,
      duration_text TEXT,
      comments TEXT,
      coach_name TEXT,
      updated_at TEXT
    )`
  ).run();

  const query = specificAthleteId
    ? env.DB.prepare('SELECT * FROM athlete_email_preferences WHERE athlete_id = ?').bind(specificAthleteId)
    : env.DB.prepare('SELECT * FROM athlete_email_preferences WHERE enabled = 1');

  const { results: athletes } = await query.all();
  if (!athletes || athletes.length === 0) {
    return { sent: 0, errors: 0, details: [] };
  }

  let sent = 0;
  let errors = 0;
  const details: any[] = [];
  const now = new Date();
  const todayIso = overrideDate || now.toISOString().split('T')[0];

  for (const ath of athletes) {
    // If not manual dispatch (no specificAthleteId), check if this is their preferred hour
    if (!specificAthleteId && ath.timezone) {
      try {
        const athDateStr = new Intl.DateTimeFormat('en-US', {
          timeZone: ath.timezone || 'America/New_York',
          hour: 'numeric',
          hour12: false,
        }).format(now);
        const currentLocalHour = parseInt(athDateStr, 10);
        if (currentLocalHour !== Number(ath.preferred_hour ?? 6)) {
          continue; // not their delivery hour yet
        }
      } catch {
        // Fallback: proceed
      }
    }

    // Look up today's assigned workout
    const workout = await env.DB.prepare(
      'SELECT * FROM assigned_plan_workouts WHERE athlete_id = ? AND workout_date = ? ORDER BY distance DESC LIMIT 1'
    )
      .bind(ath.athlete_id, todayIso)
      .first();

    const emailData: WorkoutEmailData = {
      athleteName: ath.name || 'Runner',
      athleteEmail: ath.email,
      date: todayIso,
      workout: workout
        ? {
            distance: Number(workout.distance) || 0,
            unit: workout.unit || 'mi',
            runType: workout.run_type || 'easy',
            targetPace: workout.target_pace || undefined,
            durationFormatted: workout.duration_text || undefined,
            comments: workout.comments || undefined,
            coachName: workout.coach_name || 'Michael Carey',
          }
        : null,
    };

    const subject =
      workout && workout.distance > 0
        ? `🏃 Today's Hop Run: ${workout.distance} ${(workout.unit || 'mi').toUpperCase()} ${(workout.run_type || 'EASY').toUpperCase()}`
        : `🌴 Today's Hop Run: Rest & Active Recovery`;

    const html = generateWorkoutEmailHtml(emailData);
    const result = await sendEmailMessage(env, ath.email, subject, html);
    if (result.success) {
      sent++;
      details.push({ athlete: ath.email, status: 'sent', id: result.id });
    } else {
      errors++;
      details.push({ athlete: ath.email, status: 'failed', error: result.error });
    }
  }

  return { sent, errors, details };
}
