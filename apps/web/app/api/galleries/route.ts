import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { apiError, optionalString, readJson, requiredString } from '@/lib/server/http';
import { createGallery, listGalleries } from '@/lib/server/store';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) { try { await requireOwner(request); return NextResponse.json(await listGalleries()); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) {
  try { await requireOwner(request); const body = await readJson(request) as Record<string, unknown>; const sourceUrl = optionalString(body.sourceUrl, 'sourceUrl'); if (sourceUrl) { try { new URL(sourceUrl); } catch { throw new Error('invalid'); } } return NextResponse.json(await createGallery({ name: requiredString(body.name, 'name', 200), address: optionalString(body.address, 'address', 500), sourceUrl }), { status: 201 }); }
  catch (error) { return apiError(error instanceof Error && error.message === 'invalid' ? new Error('') : error); }
}
