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
