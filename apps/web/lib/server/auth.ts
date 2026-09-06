import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDatabase } from '@gallery/db';
import { ApiError, assertSameOrigin, requestIsLocal } from './http';
import type { NextRequest } from 'next/server';

const COOKIE = 'gallery_twin_owner';
const DAY = 24 * 60 * 60 * 1000;

export async function establishOwnerSession(request: NextRequest) {
  if (!requestIsLocal(request)) throw new ApiError(403, 'LOCAL_ONLY', 'Owner sessions can only be created locally');
  const existing = (await cookies()).get(COOKIE)?.value;
  if (existing && await validSession(existing)) return { token: existing, isNew: false };
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
  else if (!requestIsLocal(request) || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'LOCAL_ONLY', 'Private resources are local only');
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !await validSession(token)) throw new ApiError(401, 'OWNER_REQUIRED', 'Owner session required');
}

export function ownerCookie(token: string, expires?: Date) {
  return { name: COOKIE, value: token, httpOnly: true, sameSite: 'strict' as const, secure: false, path: '/', expires };
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
