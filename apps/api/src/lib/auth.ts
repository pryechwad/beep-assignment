import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from './http';

export const SESSION_COOKIE = 'beep_session';
const TOKEN_TTL_SECONDS = 8 * 3600;

export interface AdminClaims {
  sub: string;
  email: string;
  role: 'ADMIN' | 'EVALUATOR';
}

export type AuthedRequest = Request & { admin: AdminClaims };

export function signToken(secret: string, claims: AdminClaims): string {
  return jwt.sign(claims, secret, { expiresIn: TOKEN_TTL_SECONDS, issuer: 'beep-api', audience: 'beep-admin' });
}

export function cookieOptions(production: boolean) {
  return { httpOnly: true, secure: production, sameSite: 'lax' as const, maxAge: TOKEN_TTL_SECONDS * 1000, path: '/' };
}

function readToken(req: Request): string | null {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** JWT guard for /admin routes. Tokens live in an httpOnly cookie (or a Bearer header for API clients). */
export function requireAdmin(secret: string, roles: AdminClaims['role'][] = ['ADMIN', 'EVALUATOR']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
    try {
      const claims = jwt.verify(token, secret, { issuer: 'beep-api', audience: 'beep-admin' }) as AdminClaims;
      if (!roles.includes(claims.role)) return next(new HttpError(403, 'FORBIDDEN', 'Insufficient permissions'));
      (req as AuthedRequest).admin = claims;
      next();
    } catch {
      next(new HttpError(401, 'INVALID_SESSION', 'Session expired or invalid'));
    }
  };
}
