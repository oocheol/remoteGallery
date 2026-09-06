import { randomUUID } from 'node:crypto';
import { getDatabase, withTransaction, type SqlDatabase } from '@gallery/db';
import type { Asset, Artwork, Exhibition, Gallery, GalleryDetail, Job, JobStatus, Placement, Scene } from '@gallery/shared';
import { sceneSchema } from '@gallery/shared';
import { findCollisions, validatePlacement } from '@gallery/three';
import { ApiError } from './http';

type AssetRow = { id: string; gallery_id: string; name: string; mime_type: string; size_bytes: number; role: Asset['role']; storage_path: string; public_derivative: boolean };
type JobRow = { id: string; gallery_id: string; mode: string; asset_ids: unknown; status: JobStatus; progress: number; message: string; error: unknown; scene_id: string | null; created_at: string; updated_at: string; attempts: number; lease_until: string | null };

const json = <T>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) as T : value as T;
const now = () => new Date().toISOString();

export const assetUrl = (id: string) => `/api/assets/${id}`;

export function toAsset(row: AssetRow): Asset {
  return { id: row.id, galleryId: row.gallery_id, name: row.name, mimeType: row.mime_type, size: Number(row.size_bytes), role: row.role, url: assetUrl(row.id) };
}

export function toJob(row: JobRow): Job {
  return { id: row.id, galleryId: row.gallery_id, mode: row.mode, status: row.status, progress: row.progress, message: row.message, ...(row.error ? { error: typeof row.error === 'string' ? row.error : (json<{ message?: string }>(row.error).message || 'Processing failed') } : {}), ...(row.scene_id ? { sceneId: row.scene_id } : {}), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getGallery(id: string): Promise<Gallery> {
  const db = await getDatabase();
  const result = await db.query<{ id: string; name: string; address: string; source_url: string | null; created_at: string; updated_at: string }>('SELECT * FROM galleries WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'GALLERY_NOT_FOUND', 'Gallery not found');
  return { id: row.id, name: row.name, address: row.address, ...(row.source_url ? { sourceUrl: row.source_url } : {}), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listGalleries(): Promise<Gallery[]> {
  const db = await getDatabase();
  const result = await db.query<{ id: string; name: string; address: string; source_url: string | null; created_at: string; updated_at: string }>('SELECT * FROM galleries ORDER BY created_at DESC');
  return result.rows.map(row => ({ id: row.id, name: row.name, address: row.address, ...(row.source_url ? { sourceUrl: row.source_url } : {}), createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function createGallery(input: { name: string; address?: string; sourceUrl?: string }): Promise<GalleryDetail> {
  const id = randomUUID(); const timestamp = now(); const exhibitionId = randomUUID();
  await withTransaction(async db => {
    await db.query('INSERT INTO galleries(id,name,address,source_url,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [id, input.name, input.address || '', input.sourceUrl || null, timestamp]);
    await db.query('INSERT INTO exhibitions(id,gallery_id,title,revision,placements,updated_at) VALUES ($1,$2,$3,1,$4,$5)', [exhibitionId, id, `${input.name} 전시`, JSON.stringify([]), timestamp]);
  });
  return getGalleryDetail(id);
}

export async function getGalleryDetail(id: string): Promise<GalleryDetail> {
  const db = await getDatabase();
  const gallery = await getGallery(id);
  const [sceneResult, exhibitionResult, artworkResult, assetResult, jobResult] = await Promise.all([
    db.query<{ scene: unknown }>('SELECT scene FROM scenes WHERE gallery_id=$1', [id]),
    db.query<{ id: string; gallery_id: string; title: string; revision: number; placements: unknown; updated_at: string }>('SELECT * FROM exhibitions WHERE gallery_id=$1', [id]),
    db.query<{ artwork: unknown }>('SELECT artwork FROM artworks WHERE gallery_id=$1 ORDER BY created_at', [id]),
    db.query<AssetRow>('SELECT * FROM assets WHERE gallery_id=$1 ORDER BY created_at DESC', [id]),
    db.query<JobRow>('SELECT * FROM jobs WHERE gallery_id=$1 ORDER BY created_at DESC', [id])
  ]);
  const ex = exhibitionResult.rows[0];
  if (!ex) throw new ApiError(500, 'EXHIBITION_MISSING', 'Gallery exhibition is missing');
  const exhibition: Exhibition = { id: ex.id, galleryId: ex.gallery_id, title: ex.title, revision: ex.revision, placements: json<Placement[]>(ex.placements), updatedAt: ex.updated_at };
  return { gallery, scene: sceneResult.rows[0] ? json<Scene>(sceneResult.rows[0].scene) : null, exhibition, artworks: artworkResult.rows.map(row => json<Artwork>(row.artwork)), assets: assetResult.rows.map(toAsset), jobs: jobResult.rows.map(toJob) };
}

export async function getAssetRow(id: string): Promise<AssetRow> {
  const db = await getDatabase();
  const result = await db.query<AssetRow>('SELECT * FROM assets WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return row;
}

export async function createAsset(row: Omit<AssetRow, 'public_derivative'> & { public_derivative?: boolean }) {
  const db = await getDatabase();
  await getGallery(row.gallery_id);
  await db.query('INSERT INTO assets(id,gallery_id,name,mime_type,size_bytes,role,storage_path,public_derivative,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [row.id, row.gallery_id, row.name, row.mime_type, row.size_bytes, row.role, row.storage_path, row.public_derivative || false, now()]);
  return toAsset({ ...row, public_derivative: row.public_derivative || false });
}

export async function createArtwork(input: Omit<Artwork, 'id'>): Promise<Artwork> {
  const db = await getDatabase();
  await getGallery(input.galleryId);
  const id = randomUUID(); const artwork: Artwork = { ...input, id };
  await db.query('INSERT INTO artworks(id,gallery_id,artwork,created_at) VALUES ($1,$2,$3,$4)', [id, input.galleryId, JSON.stringify(artwork), now()]);
  return artwork;
}

export async function getJob(id: string) {
  const db = await getDatabase(); const result = await db.query<JobRow>('SELECT * FROM jobs WHERE id=$1', [id]);
  if (!result.rows[0]) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found');
  return toJob(result.rows[0]);
}

export async function createJob(input: { galleryId: string; mode: string; assetIds: string[] }) {
  const db = await getDatabase(); await getGallery(input.galleryId);
  const assets = await Promise.all(input.assetIds.map(getAssetRow));
  if (assets.some(asset => asset.gallery_id !== input.galleryId)) throw new ApiError(400, 'ASSET_GALLERY_MISMATCH', 'Assets must belong to this gallery');
  const id = randomUUID(); const timestamp = now();
  await db.query('INSERT INTO jobs(id,gallery_id,mode,asset_ids,status,progress,message,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$7)', [id, input.galleryId, input.mode, JSON.stringify(input.assetIds), 'UPLOAD', 'Queued for processing', timestamp]);
  return getJob(id);
}

export function validateScene(scene: unknown, galleryId: string): Scene {
  const parsed = sceneSchema.safeParse(scene);
  if (!parsed.success) throw new ApiError(400, 'INVALID_SCENE', 'Scene does not match the required format');
  const value = parsed.data;
  if (value.galleryId !== galleryId) throw new ApiError(400, 'SCENE_GALLERY_MISMATCH', 'Scene belongs to a different gallery');
  const sparseWithoutProxy = value.kind === 'sfm' && value.visual.kind === 'sparse' && value.walls.length === 0 && value.floor.polygon.length === 0;
  if ((!sparseWithoutProxy && (!value.walls.length || value.floor.polygon.length < 3)) || !finiteScene(value)) throw new ApiError(400, 'INVALID_SCENE_GEOMETRY', 'Scene geometry is invalid');
  for (const wall of value.walls) {
    if (wall.height <= 0 || wall.height > 20 || wall.thickness < 0 || wall.thickness > 2 || wallLength(wall) < .05) throw new ApiError(400, 'INVALID_WALL', 'Wall dimensions are invalid');
  }
  return value;
}

function finiteScene(scene: Scene) {
  const values = [...scene.floor.polygon.flat(), scene.floor.y, scene.calibration.scaleFactor, ...scene.walls.flatMap(w => [...w.start, ...w.end, w.height, w.thickness])];
  return values.every(value => Number.isFinite(value) && Math.abs(value) < 10_000) && scene.calibration.scaleFactor > 0 && scene.calibration.scaleFactor < 100;
}
const wallLength = (wall: Scene['walls'][number]) => Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);

export function validatePlacements(placements: unknown, scene: Scene, artworks: Artwork[]) {
  if (!Array.isArray(placements)) throw new ApiError(400, 'INVALID_PLACEMENTS', 'placements must be an array');
  const seen = new Set<string>(); const artworkMap = new Map(artworks.map(art => [art.id, art])); const wallMap = new Map(scene.walls.map(wall => [wall.id, wall]));
  const normalized: Placement[] = placements.map(raw => {
    if (!raw || typeof raw !== 'object') throw new ApiError(400, 'INVALID_PLACEMENT', 'Placement is invalid');
    const p = raw as Placement; const art = artworkMap.get(p.artworkId); const wall = wallMap.get(p.wallId);
    if (!p.id || !art || !wall || !Number.isFinite(p.u) || !Number.isFinite(p.v) || !Number.isFinite(p.rotation) || typeof p.locked !== 'boolean') throw new ApiError(400, 'INVALID_PLACEMENT', 'Placement references or position are invalid');
    if (seen.has(p.id)) throw new ApiError(400, 'DUPLICATE_PLACEMENT', 'Duplicate placement id');
    seen.add(p.id);
    if (validatePlacement(p, art, wall).length) throw new ApiError(400, 'PLACEMENT_OUT_OF_BOUNDS', `Artwork ${art.title} does not fit on its wall`);
    return { id: p.id, artworkId: p.artworkId, wallId: p.wallId, u: p.u, v: p.v, rotation: p.rotation, locked: p.locked };
  });
  if (findCollisions(normalized, artworks, scene.walls).length) throw new ApiError(400, 'PLACEMENT_COLLISION', 'Artwork placements overlap');
  return normalized;
}

export async function updateScene(galleryId: string, input: { scene: unknown; placements?: unknown; expectedRevision?: unknown }) {
  const parsedScene = validateScene(input.scene, galleryId);
  return withTransaction(async db => {
    const priorSceneResult = await db.query<{ scene: unknown }>('SELECT scene FROM scenes WHERE gallery_id=$1', [galleryId]);
    if (priorSceneResult.rows[0]) {
      const priorScene = json<Scene>(priorSceneResult.rows[0].scene);
      if (parsedScene.id !== priorScene.id || parsedScene.version < priorScene.version) throw new ApiError(409, 'SCENE_CONFLICT', 'This scene has been replaced or is newer than your copy');
    }
    const artResult = await db.query<{ artwork: unknown }>('SELECT artwork FROM artworks WHERE gallery_id=$1', [galleryId]);
    const exhibitionResult = await db.query<{ id: string; revision: number }>('SELECT id,revision FROM exhibitions WHERE gallery_id=$1', [galleryId]);
    const exhibition = exhibitionResult.rows[0]; if (!exhibition) throw new ApiError(404, 'GALLERY_NOT_FOUND', 'Gallery not found');
    if (input.expectedRevision !== undefined && (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== exhibition.revision)) throw new ApiError(409, 'REVISION_CONFLICT', 'This exhibition was updated elsewhere');
    const artworks = artResult.rows.map(row => json<Artwork>(row.artwork));
    const existing = await db.query<{ placements: unknown }>('SELECT placements FROM exhibitions WHERE id=$1', [exhibition.id]);
    // Scene changes are rejected when already-saved artwork could become invalid.
    const placements = input.placements === undefined ? validatePlacements(json<Placement[]>(existing.rows[0].placements), parsedScene, artworks) : validatePlacements(input.placements, parsedScene, artworks);
    const timestamp = now();
    await db.query('INSERT INTO scenes(gallery_id,scene,updated_at) VALUES($1,$2,$3) ON CONFLICT(gallery_id) DO UPDATE SET scene=EXCLUDED.scene, updated_at=EXCLUDED.updated_at', [galleryId, JSON.stringify(parsedScene), timestamp]);
    if (input.placements !== undefined) await db.query('UPDATE exhibitions SET placements=$1, revision=revision+1, updated_at=$2 WHERE id=$3', [JSON.stringify(placements), timestamp, exhibition.id]);
    await db.query('UPDATE galleries SET updated_at=$1 WHERE id=$2', [timestamp, galleryId]);
    return parsedScene;
  });
}

export async function updateExhibition(id: string, input: { expectedRevision: unknown; title: unknown; placements: unknown }) {
  return withTransaction(async db => {
    const exResult = await db.query<{ id: string; gallery_id: string; revision: number }>('SELECT id,gallery_id,revision FROM exhibitions WHERE id=$1', [id]); const ex = exResult.rows[0];
    if (!ex) throw new ApiError(404, 'EXHIBITION_NOT_FOUND', 'Exhibition not found');
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== ex.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'This exhibition was updated elsewhere');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new ApiError(400, 'INVALID_INPUT', 'Exhibition title is invalid');
    const sceneResult = await db.query<{ scene: unknown }>('SELECT scene FROM scenes WHERE gallery_id=$1', [ex.gallery_id]); if (!sceneResult.rows[0]) throw new ApiError(400, 'SCENE_REQUIRED', 'Create a scene before placing artworks');
    const artResult = await db.query<{ artwork: unknown }>('SELECT artwork FROM artworks WHERE gallery_id=$1', [ex.gallery_id]);
    const placements = validatePlacements(input.placements, json<Scene>(sceneResult.rows[0].scene), artResult.rows.map(row => json<Artwork>(row.artwork)));
    const timestamp = now();
    await db.query('UPDATE exhibitions SET title=$1,placements=$2,revision=revision+1,updated_at=$3 WHERE id=$4', [input.title.trim(), JSON.stringify(placements), timestamp, id]);
    return { id: ex.id, galleryId: ex.gallery_id, title: input.title.trim(), revision: ex.revision + 1, placements, updatedAt: timestamp } satisfies Exhibition;
  });
}

export async function claimJob(workerId: string) {
  return withTransaction(async db => {
    const timestamp = now();
    await db.query("UPDATE jobs SET status='FAILED', error=$1, message='Worker lease expired', updated_at=$2, lease_until=NULL WHERE status NOT IN ('READY','FAILED') AND lease_until IS NOT NULL AND lease_until < $2", [JSON.stringify({ code: 'WORKER_TIMEOUT', message: 'Worker lease expired' }), timestamp]);
    const result = await db.query<JobRow>("SELECT * FROM jobs WHERE status='UPLOAD' ORDER BY created_at LIMIT 1"); const job = result.rows[0];
    if (!job) return null;
    const leaseUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await db.query("UPDATE jobs SET status='VALIDATING',progress=5,message='Worker claimed job',attempts=attempts+1,worker_id=$1,lease_until=$2,updated_at=$3 WHERE id=$4", [workerId, leaseUntil, timestamp, job.id]);
    return { ...toJob({ ...job, status: 'VALIDATING', progress: 5, message: 'Worker claimed job', updated_at: timestamp }), assetIds: json<string[]>(job.asset_ids), leaseUntil };
  });
}

export async function workerUpdateJob(id: string, input: { status: JobStatus; progress: number; message: string; error?: unknown; scene?: unknown; sceneId?: string }) {
  if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100 || !input.message || input.message.length > 500) throw new ApiError(400, 'INVALID_JOB_UPDATE', 'Job update is invalid');
  if (input.scene !== undefined) throw new ApiError(400, 'INVALID_JOB_UPDATE', 'Use the atomic ready-job commit for a scene');
  return withTransaction(async db => {
    const rowResult = await db.query<JobRow>('SELECT * FROM jobs WHERE id=$1', [id]); const job = rowResult.rows[0]; if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found');
    if (job.status === 'READY' || job.status === 'FAILED') throw new ApiError(409, 'JOB_TERMINAL', 'Job is already complete');
    const timestamp = now(); const lease = input.status === 'READY' || input.status === 'FAILED' ? null : new Date(Date.now() + 10 * 60_000).toISOString();
    await db.query('UPDATE jobs SET status=$1,progress=$2,message=$3,error=$4,scene_id=$5,lease_until=$6,updated_at=$7 WHERE id=$8 AND status NOT IN (\'READY\',\'FAILED\')', [input.status, input.progress, input.message, input.error ? JSON.stringify(input.error) : null, input.sceneId || null, lease, timestamp, id]);
    return toJob({ ...job, status: input.status, progress: input.progress, message: input.message, error: input.error || null, scene_id: input.sceneId || null, updated_at: timestamp });
  });
}

/** Atomically persists a verified generated scene and transitions its job to READY. */
export async function commitWorkerReady(id: string, input: { scene: unknown; message: string; sceneId?: string; generatedAssets?: Array<Omit<AssetRow, 'public_derivative'> & { public_derivative?: boolean }> }) {
  if (!input.message || input.message.length > 500) throw new ApiError(400, 'INVALID_JOB_UPDATE', 'Job message is invalid');
  return withTransaction(async db => {
    const jobResult = await db.query<JobRow>('SELECT * FROM jobs WHERE id=$1', [id]); const job = jobResult.rows[0];
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found');
    if (job.status === 'READY' || job.status === 'FAILED') throw new ApiError(409, 'JOB_TERMINAL', 'Job is already complete');
    const scene = validateScene(input.scene, job.gallery_id);
    const currentScene = await db.query<{ scene: unknown }>('SELECT scene FROM scenes WHERE gallery_id=$1', [job.gallery_id]);
    if (currentScene.rows[0]) {
      const current = json<Scene>(currentScene.rows[0].scene);
      // A reconstruction queued before a curator edit must never silently replace it.
      if (current.id !== scene.id || current.version >= scene.version) throw new ApiError(409, 'SCENE_CONFLICT', 'A newer scene is already saved');
    }
    const exhibitionResult = await db.query<{ id: string; placements: unknown }>('SELECT id,placements FROM exhibitions WHERE gallery_id=$1', [job.gallery_id]); const exhibition = exhibitionResult.rows[0];
    if (!exhibition) throw new ApiError(500, 'EXHIBITION_MISSING', 'Gallery exhibition is missing');
    const artworks = await db.query<{ artwork: unknown }>('SELECT artwork FROM artworks WHERE gallery_id=$1', [job.gallery_id]);
    // A generated sparse scene without walls cannot invalidate a saved installation.
    validatePlacements(json<Placement[]>(exhibition.placements), scene, artworks.rows.map(row => json<Artwork>(row.artwork)));
    const timestamp = now();
    for (const asset of input.generatedAssets || []) {
      await db.query('INSERT INTO assets(id,gallery_id,name,mime_type,size_bytes,role,storage_path,public_derivative,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [asset.id, job.gallery_id, asset.name, asset.mime_type, asset.size_bytes, asset.role, asset.storage_path, asset.public_derivative || false, timestamp]);
    }
    await db.query('INSERT INTO scenes(gallery_id,scene,updated_at) VALUES($1,$2,$3) ON CONFLICT(gallery_id) DO UPDATE SET scene=EXCLUDED.scene, updated_at=EXCLUDED.updated_at', [job.gallery_id, JSON.stringify(scene), timestamp]);
    await db.query("UPDATE jobs SET status='READY',progress=100,message=$1,error=NULL,scene_id=$2,lease_until=NULL,updated_at=$3 WHERE id=$4 AND status NOT IN ('READY','FAILED')", [input.message, input.sceneId || scene.id, timestamp, id]);
    await db.query('UPDATE galleries SET updated_at=$1 WHERE id=$2', [timestamp, job.gallery_id]);
    return toJob({ ...job, status: 'READY', progress: 100, message: input.message, error: null, scene_id: input.sceneId || scene.id, updated_at: timestamp });
  });
}
