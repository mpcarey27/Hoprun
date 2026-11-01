import { onRequest, dispatchScheduledDailyEmails } from './api/[[route]]';

export interface Env {
  DB?: any;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  RESEND_API_KEY?: string;
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
    if (ctx?.waitUntil) {
      ctx.waitUntil(dispatchScheduledDailyEmails(env));
    } else {
      await dispatchScheduledDailyEmails(env);
    }
  },
};
