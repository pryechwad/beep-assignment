import type { PrismaClient } from '@beep/database';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { cookieOptions, requireAdmin, SESSION_COOKIE, signToken, type AuthedRequest } from '../lib/auth';
import { asyncHandler, HttpError } from '../lib/http';

// A real hash compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

export function authRouter(db: PrismaClient, jwtSecret: string, production: boolean): Router {
  const r = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Try again in 15 minutes.' } } });

  r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const user = await db.adminUser.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(SESSION_COOKIE, signToken(jwtSecret, { sub: user.id, email: user.email, role: user.role }), cookieOptions(production));
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }));

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(production), maxAge: undefined });
    res.json({ ok: true });
  });

  r.get('/me', requireAdmin(jwtSecret), asyncHandler(async (req, res) => {
    const user = await db.adminUser.findUnique({ where: { id: (req as AuthedRequest).admin.sub }, select: { id: true, email: true, name: true, role: true } });
    if (!user) throw new HttpError(401, 'INVALID_SESSION', 'Account no longer exists');
    res.json({ user });
  }));

  return r;
}
