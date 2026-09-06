import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { apiError, readJson } from '@/lib/server/http';
import { updateExhibition } from '@/lib/server/store';
export const runtime = 'nodejs';
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { await requireOwner(request); const body = await readJson(request) as Record<string, unknown>; return NextResponse.json(await updateExhibition((await context.params).id, { expectedRevision: body.expectedRevision, title: body.title, placements: body.placements })); } catch (error) { return apiError(error); } }
