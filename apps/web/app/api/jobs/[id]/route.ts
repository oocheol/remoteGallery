import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { apiError } from '@/lib/server/http';
import { getJob } from '@/lib/server/store';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { await requireOwner(request); return NextResponse.json(await getJob((await context.params).id)); } catch (error) { return apiError(error); } }
