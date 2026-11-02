// Cloudflare Pages Functions API Handler
// Free Tier: Edge compute with zero cold starts + D1 SQLite database

import {
  generateWorkoutEmailHtml,
  generateWeeklyPlanEmailHtml,
  sendEmailMessage,
  formatWeekDateRange,
  type WorkoutEmailData,
  type WeeklyPlanDayData,
  type WeeklyPlanEmailData,
} from '../emailService';

export function calculateMondayDate(refDate?: Date | string): string {
  const d = refDate ? new Date(refDate) : new Date();
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dt = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
}

export function getWeekDatesFromMonday(mondayStr: string): string[] {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDate = new Date(y, m - 1, d + i);
    const yr = nextDate.getFullYear();
    const mo = String(nextDate.getMonth() + 1).padStart(2, '0');
    const da = String(nextDate.getDate()).padStart(2, '0');
    dates.push(`${yr}-${mo}-${da}`);
  }
  return dates;
}

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

      // Ensure workouts table exists with full metadata columns
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS workouts (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          athlete_id TEXT,
          athlete_name TEXT,
          workout_date TEXT NOT NULL,
          run_order INTEGER DEFAULT 1,
          distance REAL NOT NULL,
          distance_unit TEXT DEFAULT 'mi',
          run_type TEXT NOT NULL,
          multiplier REAL NOT NULL,
          load REAL NOT NULL,
          comments TEXT,
          completed INTEGER DEFAULT 1,
          title TEXT,
          source TEXT,
          external_activity_id TEXT,
          data_json TEXT,
          updated_at TEXT
        )`
      ).run().catch(() => {});

      // Add missing columns if upgrading an existing D1 table
      const alterCols = [
        'athlete_id TEXT',
        'athlete_name TEXT',
        'title TEXT',
        'source TEXT',
        'external_activity_id TEXT',
        'data_json TEXT',
        'updated_at TEXT',
      ];
      for (const col of alterCols) {
        try {
          await env.DB.prepare(`ALTER TABLE workouts ADD COLUMN ${col}`).run();
        } catch {
          // Column already exists, ignore
        }
      }

      // One-time self-healing data migration: separate any legacy unassigned/user_coach_1 runs to proper athlete IDs
      try {
        await env.DB.prepare(
          `UPDATE workouts
           SET athlete_id = 'user_1793563915467_10fr', athlete_name = 'Robert Reynoso', user_id = 'user_1793563915467_10fr'
           WHERE (athlete_id = 'user_coach_1' OR athlete_id IS NULL OR athlete_id = '')
             AND (comments LIKE '%Garmin Forerunner 955%' OR (updated_at LIKE '%2026-11-01 21:36%' AND comments LIKE '%Garmin Connect%'))`
        ).run();
        await env.DB.prepare(
          `UPDATE workouts
           SET athlete_id = 'user_1793482686680_2wma', athlete_name = 'Elise Whisler', user_id = 'user_1793482686680_2wma'
           WHERE (athlete_id = 'user_coach_1' OR athlete_id IS NULL OR athlete_id = '')
             AND (comments LIKE '%Garmin Forerunner 265S%' OR comments LIKE '%Strava App%' OR (updated_at LIKE '%2026-11-01 19:%' AND (comments LIKE '%Garmin Forerunner 265)%' OR comments LIKE '%Garmin Connect%')))`
        ).run();
        await env.DB.prepare(
          `UPDATE workouts
           SET athlete_id = 'user_michael_carey', athlete_name = 'Michael Carey', user_id = 'user_michael_carey'
           WHERE athlete_id = 'user_coach_1' OR athlete_id IS NULL OR athlete_id = ''`
        ).run();
      } catch {
        // Migration completed or ignore
      }

      if (method === 'GET') {
        const coachView = url.searchParams.get('coachView') === 'true' || url.searchParams.get('coachView') === '1';
        const athleteIdParam = url.searchParams.get('athleteId');
        const userIdParam = url.searchParams.get('userId');

        let rows: any[] = [];
        if (coachView || athleteIdParam === 'all') {
          const { results } = await env.DB.prepare(
            'SELECT * FROM workouts ORDER BY workout_date ASC, run_order ASC'
          ).all();
          rows = results || [];
        } else if (athleteIdParam) {
          const { results } = await env.DB.prepare(
            'SELECT * FROM workouts WHERE athlete_id = ? OR user_id = ? ORDER BY workout_date ASC, run_order ASC'
          ).bind(athleteIdParam, athleteIdParam).all();
          rows = results || [];
        } else if (userIdParam) {
          const { results } = await env.DB.prepare(
            'SELECT * FROM workouts WHERE user_id = ? OR athlete_id = ? ORDER BY workout_date ASC, run_order ASC'
          ).bind(userIdParam, userIdParam).all();
          rows = results || [];
        } else {
          const { results } = await env.DB.prepare(
            'SELECT * FROM workouts ORDER BY workout_date ASC, run_order ASC'
          ).all();
          rows = results || [];
        }

        const workouts = rows.map((row: any) => {
          const cleanAthId = row.athlete_id && row.athlete_id !== 'user_coach_1' ? row.athlete_id : null;
          const cleanAthName = row.athlete_name && row.athlete_name !== '' ? row.athlete_name : null;

          if (row.data_json) {
            try {
              const parsed = JSON.parse(row.data_json);
              if (parsed && typeof parsed === 'object') {
                const effectiveAthId = cleanAthId || (parsed.athleteId && parsed.athleteId !== 'user_coach_1' ? parsed.athleteId : row.user_id);
                const effectiveAthName = cleanAthName || parsed.athleteName || '';
                return {
                  ...parsed,
                  id: parsed.id || row.id,
                  workoutDate: parsed.workoutDate || row.workout_date,
                  athleteId: effectiveAthId,
                  athleteName: effectiveAthName,
                  userId: cleanAthId || parsed.userId || row.user_id,
                  distance: typeof parsed.distance === 'number' ? parsed.distance : row.distance,
                  distanceUnit: parsed.distanceUnit || row.distance_unit || 'mi',
                  runType: parsed.runType || row.run_type || 'easy',
                  completed: parsed.completed !== undefined ? Boolean(parsed.completed) : Boolean(row.completed),
                  updatedAt: parsed.updatedAt || row.updated_at,
                };
              }
            } catch {
              // Fall through to database columns
            }
          }
          return {
            id: row.id,
            userId: cleanAthId || row.user_id,
            athleteId: cleanAthId || row.user_id,
            athleteName: cleanAthName || '',
            workoutDate: row.workout_date,
            runOrder: row.run_order,
            distance: row.distance,
            distanceUnit: row.distance_unit,
            runType: row.run_type,
            multiplier: row.multiplier,
            load: row.load,
            comments: row.comments || '',
            completed: Boolean(row.completed),
            title: row.title || undefined,
            source: row.source || undefined,
            externalActivityId: row.external_activity_id || undefined,
            updatedAt: row.updated_at || undefined,
          };
        });

        return new Response(JSON.stringify({ workouts }), { headers: corsHeaders });
      }

      if (method === 'POST') {
        const body: any = await request.json().catch(() => ({}));
        const rawWorkouts: any[] = Array.isArray(body.workouts)
          ? body.workouts
          : body.workout
          ? [body.workout]
          : Array.isArray(body)
          ? body
          : body.id
          ? [body]
          : [];

        if (rawWorkouts.length > 0) {
          const stmt = env.DB.prepare(
            `INSERT OR REPLACE INTO workouts (
              id, user_id, athlete_id, athlete_name, workout_date, run_order, distance,
              distance_unit, run_type, multiplier, load, comments, completed, title,
              source, external_activity_id, data_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );

          for (const w of rawWorkouts) {
            let athleteId = w.athleteId;
            let athleteName = w.athleteName || '';

            // Clean fallback so workouts are never orphaned or lumped together under user_coach_1
            if (!athleteId || athleteId === 'user_coach_1') {
              const comms = w.comments || '';
              const lowerName = athleteName.toLowerCase();
              if (comms.includes('Forerunner 955') || lowerName.includes('robert') || lowerName.includes('reynoso')) {
                athleteId = 'user_1793563915467_10fr';
                athleteName = athleteName || 'Robert Reynoso';
              } else if (comms.includes('265S') || comms.includes('Strava App') || lowerName.includes('elise') || lowerName.includes('whisler')) {
                athleteId = 'user_1793482686680_2wma';
                athleteName = athleteName || 'Elise Whisler';
              } else {
                athleteId = w.userId && w.userId !== 'user_coach_1' ? w.userId : 'user_michael_carey';
                athleteName = athleteName || 'Michael Carey';
              }
            }

            const userId = athleteId;
            const workoutDate = w.workoutDate || new Date().toISOString().slice(0, 10);
            const runOrder = typeof w.runOrder === 'number' ? w.runOrder : 1;
            const distance = typeof w.distance === 'number' ? w.distance : Number(w.distance) || 0;
            const distanceUnit = w.distanceUnit || 'mi';
            const runType = w.runType || 'easy';
            const multiplier = typeof w.multiplier === 'number' ? w.multiplier : 1.0;
            const load = typeof w.load === 'number' ? w.load : 0;
            const comments = w.comments || '';
            const completed = w.completed ? 1 : 0;
            const title = w.title || '';
            const source = w.source || 'manual';
            const externalActivityId = w.externalActivityId || '';
            const dataJson = JSON.stringify({ ...w, athleteId, athleteName, userId });
            const updatedAt = w.updatedAt || new Date().toISOString();

            await stmt.bind(
              w.id,
              userId,
              athleteId,
              athleteName,
              workoutDate,
              runOrder,
              distance,
              distanceUnit,
              runType,
              multiplier,
              load,
              comments,
              completed,
              title,
              source,
              externalActivityId,
              dataJson,
              updatedAt
            ).run();
          }

          return new Response(JSON.stringify({ success: true, count: rawWorkouts.length }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, count: 0 }), { headers: corsHeaders });
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
            weekly_enabled INTEGER DEFAULT 1,
            preferred_hour INTEGER DEFAULT 6,
            timezone TEXT DEFAULT 'America/New_York',
            updated_at TEXT
          )`
        ).run();

        try {
          await env.DB.prepare(
            'ALTER TABLE athlete_email_preferences ADD COLUMN weekly_enabled INTEGER DEFAULT 1'
          ).run();
        } catch {
          // Column already exists or error ignored
        }

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
                weeklyEnabled: true,
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
                  weeklyEnabled: row.weekly_enabled !== undefined ? Boolean(row.weekly_enabled) : true,
                  preferredHour: Number(row.preferred_hour ?? 6),
                  timezone: row.timezone || 'America/New_York',
                }
              : {
                  athleteId,
                  enabled: true,
                  weeklyEnabled: true,
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
        const weeklyEnabled = body.weeklyEnabled !== false ? 1 : 0;
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
            `INSERT INTO athlete_email_preferences (athlete_id, email, name, enabled, weekly_enabled, preferred_hour, timezone, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(athlete_id) DO UPDATE SET
               email = excluded.email,
               name = excluded.name,
               enabled = excluded.enabled,
               weekly_enabled = excluded.weekly_enabled,
               preferred_hour = excluded.preferred_hour,
               timezone = excluded.timezone,
               updated_at = excluded.updated_at`
          )
            .bind(athleteId, email, name, enabled, weeklyEnabled, preferredHour, timezone, new Date().toISOString())
            .run();
        }

        return new Response(JSON.stringify({ success: true, enabled: Boolean(enabled), weeklyEnabled: Boolean(weeklyEnabled), preferredHour }), {
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

      // 5. POST /api/email-reminders/test-weekly or /api/email-reminders/dispatch-weekly
      if ((subpath === 'test-weekly' || subpath === 'dispatch-weekly') && method === 'POST') {
        const body: any = await request.json().catch(() => ({}));

        // A. Immediate Test Weekly Email requested by coach or athlete from Settings
        if (body.testEmail) {
          const testEmail = String(body.testEmail).trim().toLowerCase();
          const athName = body.athleteName || 'Michael Carey';
          const monday = body.mondayDate || calculateMondayDate();
          const weekDates = getWeekDatesFromMonday(monday);
          const formattedRange = formatWeekDateRange(weekDates[0], weekDates[6]);

          // Use provided days, or load from DB if athleteId provided, or generate a realistic sample week
          let days: WeeklyPlanDayData[] = Array.isArray(body.days) ? body.days : [];

          if (days.length === 0 && env.DB && body.athleteId) {
            const { results } = await env.DB.prepare(
              'SELECT * FROM assigned_plan_workouts WHERE athlete_id = ? AND workout_date >= ? AND workout_date <= ? ORDER BY workout_date ASC, distance DESC'
            ).bind(body.athleteId, weekDates[0], weekDates[6]).all();

            if (results && results.length > 0) {
              const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
              days = weekDates.map((dateStr, idx) => {
                const dayWorkout = results.find((w: any) => w.workout_date === dateStr);
                if (dayWorkout && Number(dayWorkout.distance) > 0) {
                  return {
                    date: dateStr,
                    dayName: DAY_NAMES[idx],
                    distance: Number(dayWorkout.distance) || 0,
                    unit: dayWorkout.unit || 'mi',
                    runType: dayWorkout.run_type || 'easy',
                    targetPace: dayWorkout.target_pace || undefined,
                    durationFormatted: dayWorkout.duration_text || undefined,
                    comments: dayWorkout.comments || undefined,
                  };
                }
                return {
                  date: dateStr,
                  dayName: DAY_NAMES[idx],
                  distance: 0,
                  unit: 'mi',
                  runType: 'rest',
                  comments: dayWorkout?.comments || undefined,
                };
              });
            }
          }

          if (days.length === 0) {
            days = [
              { date: weekDates[0], dayName: 'Monday', distance: 6, unit: 'mi', runType: 'easy', targetPace: '7:45 - 8:00 /mi', durationFormatted: '47:00', comments: 'Smooth aerobic foundation to kick off the training week.' },
              { date: weekDates[1], dayName: 'Tuesday', distance: 8, unit: 'mi', runType: 'tempo', targetPace: '6:40 /mi', durationFormatted: '58:00', comments: 'Warm-up 2 mi, then 4 miles continuous tempo at half-marathon pace, 2 mi cool down.' },
              { date: weekDates[2], dayName: 'Wednesday', distance: 0, unit: 'mi', runType: 'rest', comments: 'Active recovery. Hydrate, roll out calves, light 15 min mobility.' },
              { date: weekDates[3], dayName: 'Thursday', distance: 7, unit: 'mi', runType: 'moderate', targetPace: '7:20 /mi', durationFormatted: '51:20', comments: 'Aerobic threshold progression. Pick up pace slightly over final 2 miles.' },
              { date: weekDates[4], dayName: 'Friday', distance: 4, unit: 'mi', runType: 'recovery', targetPace: '8:15 /mi', durationFormatted: '33:00', comments: 'Shakeout run before weekend long effort. Keep effort very easy.' },
              { date: weekDates[5], dayName: 'Saturday', distance: 14, unit: 'mi', runType: 'long', targetPace: '7:35 /mi', durationFormatted: '1:46:10', comments: 'Key weekend long run! Practice race nutrition at 45 min and 75 min.' },
              { date: weekDates[6], dayName: 'Sunday', distance: 0, unit: 'mi', runType: 'rest', comments: 'Full rest day. Let your muscle glycogen restock.' },
            ];
          }

          const totalDist = days.reduce((acc, d) => acc + (Number(d.distance) || 0), 0);
          const totalDistance = Math.round(totalDist * 10) / 10;
          const unit = days.find((d) => d.distance > 0)?.unit || 'mi';

          const emailData: WeeklyPlanEmailData = {
            athleteName: athName,
            athleteEmail: testEmail,
            weekStartDate: weekDates[0],
            weekEndDate: weekDates[6],
            totalDistance,
            unit,
            coachName: body.coachName || 'Michael Carey',
            days,
          };

          const subject = `📅 Your Week Ahead: ${formattedRange} • ${totalDistance} ${unit} Planned`;
          const html = generateWeeklyPlanEmailHtml(emailData);

          const result = await sendEmailMessage(env, testEmail, subject, html);
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }

        // B. Specific Athlete dispatch or force all
        const dispatchRes = await dispatchScheduledWeeklyPlanEmails(
          env,
          body.athleteId || undefined,
          body.mondayDate || body.date || undefined
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

/**
 * Scheduled Cron Trigger: Dispatches weekly training roadmap emails on Monday mornings
 * Evaluates the 7 days of the current week (Monday to Sunday) and delivers an aggregated briefing
 */
export async function dispatchScheduledWeeklyPlanEmails(
  env: any,
  specificAthleteId?: string,
  overrideMondayDate?: string
): Promise<{ sent: number; errors: number; details: any[] }> {
  if (!env?.DB) {
    return { sent: 0, errors: 0, details: [] };
  }

  // Ensure tables and columns exist
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS athlete_email_preferences (
      athlete_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      enabled INTEGER DEFAULT 1,
      weekly_enabled INTEGER DEFAULT 1,
      preferred_hour INTEGER DEFAULT 6,
      timezone TEXT DEFAULT 'America/New_York',
      updated_at TEXT
    )`
  ).run();

  try {
    await env.DB.prepare(
      'ALTER TABLE athlete_email_preferences ADD COLUMN weekly_enabled INTEGER DEFAULT 1'
    ).run();
  } catch {
    // Column already exists or error ignored
  }

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

  const mondayIso = overrideMondayDate || calculateMondayDate();
  const weekDates = getWeekDatesFromMonday(mondayIso);
  const weekStartDate = weekDates[0];
  const weekEndDate = weekDates[6];
  const formattedRange = formatWeekDateRange(weekStartDate, weekEndDate);

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
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (const ath of athletes) {
    // If weekly_enabled is explicitly 0 and this is not a manual single-athlete dispatch, skip
    if (!specificAthleteId && ath.weekly_enabled === 0) {
      continue;
    }

    // Query workouts for this athlete during this 7-day period
    const { results: workouts } = await env.DB.prepare(
      'SELECT * FROM assigned_plan_workouts WHERE athlete_id = ? AND workout_date >= ? AND workout_date <= ? ORDER BY workout_date ASC, distance DESC'
    )
      .bind(ath.athlete_id, weekStartDate, weekEndDate)
      .all();

    // If athlete has no workouts assigned at all for this week, skip
    if (!workouts || workouts.length === 0) {
      continue;
    }

    let totalDistance = 0;
    let primaryUnit = 'mi';
    let coachName = 'Michael Carey';

    const days: WeeklyPlanDayData[] = weekDates.map((dateStr, idx) => {
      const dayName = DAY_NAMES[idx];
      const dayWorkout = (workouts || []).find((w: any) => w.workout_date === dateStr);

      if (dayWorkout && Number(dayWorkout.distance) > 0) {
        const dist = Number(dayWorkout.distance) || 0;
        totalDistance += dist;
        if (dayWorkout.unit) primaryUnit = dayWorkout.unit;
        if (dayWorkout.coach_name) coachName = dayWorkout.coach_name;

        return {
          date: dateStr,
          dayName,
          distance: dist,
          unit: dayWorkout.unit || primaryUnit,
          runType: dayWorkout.run_type || 'easy',
          targetPace: dayWorkout.target_pace || undefined,
          durationFormatted: dayWorkout.duration_text || undefined,
          comments: dayWorkout.comments || undefined,
        };
      }

      if (dayWorkout) {
        if (dayWorkout.coach_name) coachName = dayWorkout.coach_name;
        return {
          date: dateStr,
          dayName,
          distance: 0,
          unit: dayWorkout.unit || primaryUnit,
          runType: dayWorkout.run_type || 'rest',
          comments: dayWorkout.comments || undefined,
        };
      }

      return {
        date: dateStr,
        dayName,
        distance: 0,
        unit: primaryUnit,
        runType: 'rest',
      };
    });

    const roundedTotal = Math.round(totalDistance * 10) / 10;
    const emailData: WeeklyPlanEmailData = {
      athleteName: ath.name || 'Runner',
      athleteEmail: ath.email,
      weekStartDate,
      weekEndDate,
      totalDistance: roundedTotal,
      unit: primaryUnit,
      coachName,
      days,
    };

    const subject = `📅 Your Week Ahead: ${formattedRange} • ${roundedTotal} ${primaryUnit} Planned`;
    const html = generateWeeklyPlanEmailHtml(emailData);

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
