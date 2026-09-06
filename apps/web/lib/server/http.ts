import { NextRequest, NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, 'INVALID_JSON', 'Expected a JSON request body'); }
}

/** Browser mutations are accepted only from the app's own origin. */
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || !host || fetchSite === 'cross-site') throw new ApiError(403, 'ORIGIN_REQUIRED', 'Same-origin request required');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new ApiError(403, 'ORIGIN_INVALID', 'Same-origin request required'); }
  if (parsed.host !== host || (process.env.GALLERY_CLOUD !== '1' && !isLoopbackHost(parsed.hostname)) || (process.env.GALLERY_CLOUD === '1' && parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname))) {
    throw new ApiError(403, 'ORIGIN_INVALID', 'Same-origin request required');
  }
}

export function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function requestIsLocal(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] || '';
  const forwarded = request.headers.get('x-forwarded-for');
  const fetchSite = request.headers.get('sec-fetch-site');
  // Next dev may inject x-forwarded-for itself. Accept it only when every hop is
  // a loopback address; it must never be a way to mint a remote owner session.
  const forwardedLocal = !forwarded || forwarded.split(',').map(value => value.trim()).every(value => value === '127.0.0.1' || value === '::1' || value === '[::1]');
  return isLoopbackHost(host) && forwardedLocal && fetchSite !== 'cross-site';
}

export function requiredString(value: unknown, field: string, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown, field: string, max = 1000) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw new ApiError(400, 'INVALID_INPUT', `${field} is invalid`);
  return value.trim();
}
