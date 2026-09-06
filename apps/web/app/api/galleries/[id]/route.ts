import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { apiError, readJson } from '@/lib/server/http';
import { getGalleryDetail, updateScene } from '@/lib/server/store';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { try { await requireOwner(request); return NextResponse.json(await getGalleryDetail((await context.params).id)); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, context: Context) { try { await requireOwner(request); const body = await readJson(request) as Record<string, unknown>; return NextResponse.json(await updateScene((await context.params).id, { scene: body.scene, placements: body.placements, expectedRevision: body.expectedRevision })); } catch (error) { return apiError(error); } }
