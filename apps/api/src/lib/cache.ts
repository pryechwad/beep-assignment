import type { NextFunction, Request, Response } from 'express';

/**
 * Tiny in-process response cache for public aggregate endpoints. Their data
 * only changes when the pipeline runs, so a short TTL removes almost all
 * repeated database load (a dashboard view fans out to ~9 endpoints) while
 * keeping figures at most `ttlMs` stale. Concurrent misses share one
 * computation (no thundering herd). Per-process: fine for a single API
 * instance; behind several instances each keeps its own copy.
 */
export function responseCache(ttlMs: number, maxEntries = 500) {
  const store = new Map<string, { at: number; status: number; body: unknown }>();
  const inflight = new Map<string, Promise<void>>();

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'no-cache');
      res.status(hit.status).json(hit.body);
      return;
    }
    const pending = inflight.get(key);
    if (pending) {
      await pending;
      const fresh = store.get(key);
      if (fresh) {
        res.setHeader('X-Cache', 'HIT-WAIT');
        res.status(fresh.status).json(fresh.body);
        return;
      }
    }
    let resolve!: () => void;
    inflight.set(key, new Promise<void>((r) => (resolve = r)));
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        if (store.size >= maxEntries) store.delete(store.keys().next().value as string);
        store.set(key, { at: Date.now(), status: 200, body });
      }
      inflight.delete(key);
      resolve();
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'no-cache');
      return json(body);
    };
    res.on('close', () => {
      if (inflight.get(key)) {
        inflight.delete(key);
        resolve();
      }
    });
    next();
  };
}
