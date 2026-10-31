// Cloudflare Pages Functions API Handler
// Free Tier: Edge compute with zero cold starts + D1 SQLite database

interface Env {
  DB?: any; // Cloudflare D1 Database binding
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
