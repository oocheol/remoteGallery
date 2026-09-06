import { NextRequest, NextResponse } from 'next/server';
import { establishOwnerSession, ownerCookie } from '@/lib/server/auth';
import { apiError, readJson, assertSameOrigin, ApiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try { const session = await establishOwnerSession(request); const response = NextResponse.json({ ok: true, cloud: process.env.GALLERY_CLOUD === "1" }); if (session.isNew) response.cookies.set(ownerCookie(session.token, session.expires)); return response; }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request) as { password?: unknown };
    if (typeof body.password !== 'string' || body.password.length > 200) throw new ApiError(400, 'INVALID_PASSWORD', '비밀번호를 입력해 주세요.');
    const session = await establishOwnerSession(request, body.password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ownerCookie(session.token, session.expires)); return response;
  } catch (error) { return apiError(error); }
}
