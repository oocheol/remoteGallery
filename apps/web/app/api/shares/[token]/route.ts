import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@gallery/db';
import { requireOwner } from '@/lib/server/auth';
import { ApiError, apiError } from '@/lib/server/http';
import type { ShareSnapshot } from '@gallery/shared';
export const runtime = 'nodejs';
type Context = { params: Promise<{ token: string }> };
async function snapshot(token: string) { const db = await getDatabase(); const result = await db.query<{ snapshot: unknown }>('SELECT snapshot FROM shares WHERE token=$1 AND revoked_at IS NULL', [token]); if (!result.rows[0]) throw new ApiError(404, 'SHARE_NOT_FOUND', 'Share link not found'); return (typeof result.rows[0].snapshot === 'string' ? JSON.parse(result.rows[0].snapshot) : result.rows[0].snapshot) as ShareSnapshot; }
export async function GET(_request: NextRequest, context: Context) { try { return NextResponse.json(await snapshot((await context.params).token), { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return apiError(error); } }
export async function DELETE(request: NextRequest, context: Context) { try { await requireOwner(request); const db = await getDatabase(); const token = (await context.params).token; const result = await db.query('UPDATE shares SET revoked_at=$1 WHERE token=$2 AND revoked_at IS NULL', [new Date().toISOString(), token]); if (!result.affectedRows) throw new ApiError(404, 'SHARE_NOT_FOUND', 'Share link not found'); return new NextResponse(null, { status: 204 }); } catch (error) { return apiError(error); } }
