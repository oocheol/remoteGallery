import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDatabase } from '@gallery/db';
import { ApiError, assertSameOrigin, requestIsLocal } from './http';
import type { NextRequest } from 'next/server';

const COOKIE = 'gallery_twin_owner';
const DAY = 24 * 60 * 60 * 1000;

export async function establishOwnerSession(request: NextRequest, password?: string) {
  const cloud = process.env.GALLERY_CLOUD === '1';
  if (!cloud && !requestIsLocal(request)) throw new ApiError(403, 'LOCAL_ONLY', 'Owner sessions can only be created locally');
  const existing = (await cookies()).get(COOKIE)?.value;
  if (existing && await validSession(existing)) return { token: existing, isNew: false };
  if (cloud) {
    if (!password) throw new ApiError(401, 'OWNER_REQUIRED', '관리자 로그인이 필요합니다.');
    assertSameOrigin(request);
    const expected = process.env.GALLERY_ADMIN_PASSWORD_HASH;
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '관리자 로그인이 설정되지 않았습니다.');
    const db = await getDatabase();
    const key = createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').digest('hex');
    const now = new Date().toISOString(), until = new Date(Date.now() + 10 * 60_000).toISOString();
    const attempt = await db.query<{ attempts: number }>('INSERT INTO login_attempts(key,attempts,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.expires_at < $3 THEN 1 ELSE login_attempts.attempts+1 END, expires_at=CASE WHEN login_attempts.expires_at < $3 THEN $2 ELSE login_attempts.expires_at END RETURNING attempts', [key, until, now]);
    if (attempt.rows[0].attempts > 10) throw new ApiError(429, 'LOGIN_RATE_LIMIT', '잠시 후 다시 로그인해 주세요.');
    const actual = createHash('sha256').update(password).digest();
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new ApiError(401, 'INVALID_PASSWORD', '비밀번호가 맞지 않습니다.');
    await db.query('DELETE FROM login_attempts WHERE key=$1', [key]);
  }
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * DAY);
  const db = await getDatabase();
  await db.query('INSERT INTO owner_sessions(token, created_at, expires_at) VALUES ($1,$2,$3)', [token, now.toISOString(), expires.toISOString()]);
  return { token, isNew: true, expires };
}

async function validSession(token: string) {
  const db = await getDatabase();
  const result = await db.query<{ token: string }>('SELECT token FROM owner_sessions WHERE token=$1 AND expires_at > $2', [token, new Date().toISOString()]);
  return result.rows.length > 0;
}

export async function requireOwner(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
  else if ((process.env.GALLERY_CLOUD !== '1' && !requestIsLocal(request)) || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'LOCAL_ONLY', 'Private resources are local only');
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !await validSession(token)) throw new ApiError(401, 'OWNER_REQUIRED', 'Owner session required');
}

export function ownerCookie(token: string, expires?: Date) {
  return { name: COOKIE, value: token, httpOnly: true, sameSite: 'strict' as const, secure: process.env.GALLERY_CLOUD === '1', path: '/', expires };
}

export function requireWorker(request: NextRequest) {
  const expected = process.env.WORKER_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !provided || provided.length !== expected.length || !constantEquals(provided, expected)) {
    throw new ApiError(401, 'WORKER_UNAUTHORIZED', 'Worker authorization required');
  }
}

function constantEquals(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
