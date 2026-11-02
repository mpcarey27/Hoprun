import {
  onRequest,
  dispatchScheduledDailyEmails,
  dispatchScheduledWeeklyPlanEmails,
} from './api/[[route]]';

export interface Env {
  DB?: any;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  RESEND_API_KEY?: string;
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return onRequest({
        request,
        env,
        waitUntil: ctx?.waitUntil ? ctx.waitUntil.bind(ctx) : () => {},
      } as any);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    const isMonday = new Date().getUTCDay() === 1;
    const tasks: Promise<any>[] = [dispatchScheduledDailyEmails(env)];
    if (isMonday) {
      tasks.push(dispatchScheduledWeeklyPlanEmails(env));
    }

    if (ctx?.waitUntil) {
      ctx.waitUntil(Promise.all(tasks));
    } else {
      await Promise.all(tasks);
    }
  },
};
