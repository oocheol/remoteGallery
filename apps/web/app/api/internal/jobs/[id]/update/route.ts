import { NextRequest, NextResponse } from 'next/server';
import { requireWorker } from '@/lib/server/auth';
import { ApiError, apiError, readJson } from '@/lib/server/http';
import { assetUrl, commitWorkerReady, getJob, workerUpdateJob } from '@/lib/server/store';
import { jobDirectory, saveGeneratedFile } from '@/lib/server/storage';

const statuses = new Set(['VALIDATING','EXTRACTING_FRAMES','ESTIMATING_CAMERAS','RECONSTRUCTING','GENERATING_GEOMETRY','OPTIMIZING','READY','FAILED']);
type WireScene = { id?: string; visual?: { url?: string } } & Record<string, unknown>;
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireWorker(request); const body = await readJson(request) as Record<string, unknown>; if (typeof body.status !== 'string' || !statuses.has(body.status) || typeof body.progress !== 'number' || typeof body.message !== 'string') throw new ApiError(400, 'INVALID_JOB_UPDATE', 'Job update is invalid');
    const id = (await context.params).id;
    if (body.status !== 'READY') return NextResponse.json(await workerUpdateJob(id, { status: body.status as never, progress: body.progress, message: body.message, error: body.error, sceneId: typeof body.sceneId === 'string' ? body.sceneId : undefined }));
    if (!body.scene || typeof body.scene !== 'object') throw new ApiError(400, 'INVALID_JOB_UPDATE', 'Ready jobs require a scene');
    const job = await getJob(id); if (job.status === 'READY' || job.status === 'FAILED') throw new ApiError(409, 'JOB_TERMINAL', 'Job is already complete');
    let scene = structuredClone(body.scene) as WireScene; const generatedAssets: Parameters<typeof commitWorkerReady>[1]['generatedAssets'] = [];
    if (typeof body.visualPath === 'string') { const imported = await saveGeneratedFile(job.galleryId, body.visualPath, 'application/json', 'sparse-points.json', jobDirectory(id)); generatedAssets.push({ id: imported.id, gallery_id: job.galleryId, name: imported.name, mime_type: imported.mimeType, size_bytes: imported.size, role: 'reference', storage_path: imported.path, public_derivative: false }); scene = { ...scene, visual: { ...(scene.visual || {}), url: assetUrl(imported.id) } }; }
    if (typeof body.previewPath === 'string') { const imported = await saveGeneratedFile(job.galleryId, body.previewPath, 'image/jpeg', 'reconstruction-preview.jpg', jobDirectory(id)); generatedAssets.push({ id: imported.id, gallery_id: job.galleryId, name: imported.name, mime_type: imported.mimeType, size_bytes: imported.size, role: 'reference', storage_path: imported.path, public_derivative: false }); }
    return NextResponse.json(await commitWorkerReady(id, { scene, message: body.message, sceneId: typeof body.sceneId === 'string' ? body.sceneId : scene.id, generatedAssets }));
  } catch (error) { return apiError(error); }
}
