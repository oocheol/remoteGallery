import { hostname } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const base = (process.env.GALLERY_WORKER_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.WORKER_TOKEN;
if (!token) throw new Error('WORKER_TOKEN must be set before starting the worker');
const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });

async function api(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Worker API ${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<any>;
}

async function update(id: string, value: Record<string, unknown>) {
  if (typeof value.message === 'string') value.message = value.message.slice(0, 500);
  return api(`/api/internal/jobs/${id}/update`, value);
}

async function execute(job: any, manifest: any) {
  const id = job.id; const input = manifest.inputPath; const output = join(manifest.outputDir, 'result.json');
  const python = process.env.RECONSTRUCTION_PYTHON || (existsSync('services/reconstruction/.venv/bin/python') ? 'services/reconstruction/.venv/bin/python' : 'python3');
  let child: ReturnType<typeof spawn> | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let progressTimer: NodeJS.Timeout | undefined;
  let terminal = false;
  let progressChain: Promise<void> = Promise.resolve();
  const stopChild = () => { if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } setTimeout(() => { if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } }, 5000).unref(); } };
  const signal = () => stopChild(); process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    await update(id, { status: 'VALIDATING', progress: 10, message: 'Validating local media' });
    child = spawn(python, ['services/reconstruction/pipeline.py', '--input', input, '--output', output], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
    timeout = setTimeout(() => stopChild(), 11 * 60_000);
    let lastProgress = '';
    const progressPath = join(manifest.outputDir, 'progress.json');
    progressTimer = setInterval(() => {
      progressChain = progressChain.then(async () => {
        if (terminal) return;
      try {
        if (!existsSync(progressPath)) return;
        const progress = JSON.parse(readFileSync(progressPath, 'utf8'));
        if (progress.status === 'READY' || progress.status === 'FAILED') return;
        const status = typeof progress.status === 'string' ? progress.status : 'RECONSTRUCTING'; const percentage = typeof progress.progress === 'number' ? Math.max(10, Math.min(95, Math.floor(progress.progress))) : 50; const message = typeof progress.message === 'string' ? progress.message : 'Processing reconstruction'; const fingerprint = `${status}/${percentage}/${message}`;
        if (fingerprint !== lastProgress && !terminal) { lastProgress = fingerprint; await update(id, { status, progress: percentage, message }); }
      } catch { /* A concurrent atomic rename may briefly be unavailable; next poll recovers. */ }
      });
    }, 1000);
    const exit = await new Promise<number | null>((resolve, reject) => { child!.on('error', reject); child!.on('exit', resolve); });
    terminal = true; if (progressTimer) clearInterval(progressTimer); await progressChain;
    if (!existsSync(output)) throw new Error(`Reconstruction produced no result (${stderr || `exit ${exit}`})`);
    const result = JSON.parse(readFileSync(output, 'utf8'));
    if (result.status !== 'READY' || !result.scene) { await update(id, { status: 'FAILED', progress: 100, message: String(result.error?.message || 'Reconstruction failed').slice(0, 500), error: result.error || { code: 'PIPELINE_FAILED', message: stderr || 'Pipeline failed' } }); return; }
    const visualPath = typeof result.scene.visual?.url === 'string' ? result.scene.visual.url : undefined;
    const diagnostics = result.diagnostics || {}; const registration = diagnostics.reconstruction?.models?.[0]; const summary = [registration?.registeredImages && `${registration.registeredImages} cameras`, diagnostics.exportedPoints && `${diagnostics.exportedPoints} points`].filter(Boolean).join(', ');
    await update(id, { status: 'READY', progress: 100, message: `Reconstruction complete${summary ? ` · ${summary}` : ''}`, scene: result.scene, sceneId: result.scene.id, ...(visualPath ? { visualPath } : {}), ...(typeof diagnostics.previewPath === 'string' ? { previewPath: diagnostics.previewPath } : {}) });
  } catch (error) {
    try { await update(id, { status: 'FAILED', progress: 100, message: 'Worker failed', error: { code: 'WORKER_FAILED', message: error instanceof Error ? error.message : String(error) } }); } catch (updateError) { console.error(updateError); }
  } finally { terminal = true; if (timeout) clearTimeout(timeout); if (progressTimer) clearInterval(progressTimer); process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); }
}

async function loop() {
  while (!stopping) {
    try { const response = await api('/api/internal/jobs/claim', { workerId }); if (response.job) await execute(response.job, response.manifest); else await new Promise(resolve => setTimeout(resolve, 1000)); }
    catch (error) { console.error(error); await new Promise(resolve => setTimeout(resolve, 2000)); }
  }
}
await loop();
