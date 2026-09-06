import { NextRequest, NextResponse } from 'next/server';
import { requireWorker } from '@/lib/server/auth';
import { apiError, readJson } from '@/lib/server/http';
import { claimJob, getAssetRow } from '@/lib/server/store';
import { jobDirectory, writeWorkerManifest } from '@/lib/server/storage';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    requireWorker(request); const body = await readJson(request) as Record<string, unknown>; const workerId = typeof body.workerId === 'string' && body.workerId.length < 200 ? body.workerId : 'worker'; const job = await claimJob(workerId); if (!job) return NextResponse.json({ job: null });
    const assets = await Promise.all(job.assetIds.map(async id => { const asset = await getAssetRow(id); return { path: asset.storage_path, name: asset.name, mimeType: asset.mime_type }; })); const outputDir = jobDirectory(job.id); const manifest = { jobId: job.id, galleryId: job.galleryId, mode: job.mode, assets, outputDir };
    const inputPath = await writeWorkerManifest(job.id, manifest); return NextResponse.json({ job, manifest: { ...manifest, inputPath } });
  } catch (error) { return apiError(error); }
}
