import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { ApiError, apiError, readJson, requiredString } from '@/lib/server/http';
import { createJob } from '@/lib/server/store';

const modes = new Set(['measured-plan', 'video', 'photos', 'single-image', 'panorama']);
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try { await requireOwner(request); const body = await readJson(request) as Record<string, unknown>; const galleryId = requiredString(body.galleryId, 'galleryId'); if (typeof body.mode !== 'string' || !modes.has(body.mode)) throw new ApiError(400, 'INVALID_JOB_MODE', 'Job mode is invalid'); if (!Array.isArray(body.assetIds) || body.assetIds.some(id => typeof id !== 'string') || (body.mode !== 'measured-plan' && !body.assetIds.length)) throw new ApiError(400, 'INVALID_JOB_ASSETS', 'Job assets are invalid'); return NextResponse.json(await createJob({ galleryId, mode: body.mode, assetIds: body.assetIds }), { status: 201 }); }
  catch (error) { return apiError(error); }
}
