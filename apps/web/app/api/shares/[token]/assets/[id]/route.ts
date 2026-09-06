import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@gallery/db';
import { ApiError, apiError } from '@/lib/server/http';
import { getAssetRow } from '@/lib/server/store';
import { readPrivateAsset } from '@/lib/server/storage';
import type { ShareSnapshot } from '@gallery/shared';
export const runtime = 'nodejs';
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await context.params; const db = await getDatabase(); const result = await db.query<{ snapshot: unknown }>('SELECT snapshot FROM shares WHERE token=$1 AND revoked_at IS NULL', [token]); const value = result.rows[0]?.snapshot; if (!value) throw new ApiError(404, 'SHARE_NOT_FOUND', 'Share link not found'); const snapshot = (typeof value === 'string' ? JSON.parse(value) : value) as ShareSnapshot;
    // Capability is scoped to only frozen artwork derivatives and frozen visual derivative. Captures never qualify.
    const allowed = new Set(snapshot.artworks.map(art => art.imageUrl.match(/\/assets\/([\w-]+)$/)?.[1]).filter(Boolean)); const visualId = snapshot.scene.visual.url?.match(/\/assets\/([\w-]+)$/)?.[1]; if (visualId) allowed.add(visualId); if (!allowed.has(id)) throw new ApiError(404, 'SHARE_ASSET_NOT_FOUND', 'Share asset not found');
    const asset = await getAssetRow(id); if (asset.role === 'capture' || asset.gallery_id !== snapshot.exhibition.galleryId) throw new ApiError(404, 'SHARE_ASSET_NOT_FOUND', 'Share asset not found'); return new NextResponse(await readPrivateAsset(asset.storage_path), { headers: { 'Content-Type': asset.mime_type, 'Content-Length': String(asset.size_bytes), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return apiError(error); }
}
