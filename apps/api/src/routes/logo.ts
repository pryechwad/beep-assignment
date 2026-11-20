import { Router } from 'express';
import { asyncHandler } from '../lib/http';

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/;
const TTL_MS = 24 * 3600 * 1000;
type Entry = { at: number; body: Buffer | null; type: string };

/**
 * GET /api/v1/logo?domain=example.com — a company's website icon, fetched once
 * server-side and cached for 24 h. Answers 204 when the company has no usable
 * icon, so the browser falls back to a monogram without logging a 404.
 */
export function logoRouter(): Router {
  const r = Router();
  const cache = new Map<string, Entry>();
  r.get('/logo', asyncHandler(async (req, res) => {
    const domain = String(req.query.domain ?? '').toLowerCase().replace(/^www\./, '');
    if (!DOMAIN_RE.test(domain)) {
      res.status(204).end();
      return;
    }
    let hit = cache.get(domain);
    if (!hit || Date.now() - hit.at > TTL_MS) {
      let body: Buffer | null = null;
      let type = 'image/png';
      try {
        const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, { signal: AbortSignal.timeout(6000) });
        if (upstream.ok) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          // Tiny responses are the generic placeholder, not a real logo.
          if (buf.length > 300) {
            body = buf;
            type = upstream.headers.get('content-type') ?? type;
          }
        }
      } catch {
        body = null;
      }
      hit = { at: Date.now(), body, type };
      if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
      cache.set(domain, hit);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!hit.body) {
      res.status(204).end();
      return;
    }
    res.type(hit.type).send(hit.body);
  }));
  return r;
}
