import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { apiError } from '@/lib/server/http';
import { getAssetRow } from '@/lib/server/store';
import { readPrivateAsset } from '@/lib/server/storage';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { await requireOwner(request); const asset = await getAssetRow((await context.params).id); return new NextResponse(await readPrivateAsset(asset.storage_path), { headers: { 'Content-Type': asset.mime_type, 'Content-Length': String(asset.size_bytes), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); }
  catch (error) { return apiError(error); }
}
