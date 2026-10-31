import { onRequest } from './api/[[route]]';

export interface Env {
  DB?: any;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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
};
