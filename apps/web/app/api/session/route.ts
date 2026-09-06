import { NextRequest, NextResponse } from 'next/server';
import { establishOwnerSession, ownerCookie } from '@/lib/server/auth';
import { apiError } from '@/lib/server/http';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try { const session = await establishOwnerSession(request); const response = NextResponse.json({ ok: true }); if (session.isNew) response.cookies.set(ownerCookie(session.token, session.expires)); return response; }
  catch (error) { return apiError(error); }
}
