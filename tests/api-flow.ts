import assert from "node:assert/strict";

const baseUrl = (process.env.GALLERY_TEST_BASE_URL ?? process.env.GALLERY_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const pollTimeoutMs = Number(process.env.GALLERY_TEST_TIMEOUT_MS ?? 180_000);
const pollIntervalMs = Number(process.env.GALLERY_TEST_POLL_MS ?? 500);

type JsonObject = Record<string, any>;

const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let ownerCookie = "";

function url(path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function cookieFrom(response: Response) {
  const values = response.headers.getSetCookie?.() ?? [];
  const raw = values[0] ?? response.headers.get("set-cookie") ?? "";
  return raw.split(";", 1)[0];
}

async function request(path: string, init: RequestInit = {}, options: { owner?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (options.owner && ownerCookie) headers.set("cookie", ownerCookie);
  // Mutation routes enforce the local same-origin contract. A browser supplies this
  // automatically; the standalone Node test must make it explicit.
  if (options.owner) headers.set("origin", baseUrl);
  const response = await fetch(url(path), { ...init, headers });
  if (response.headers.get("set-cookie") && !ownerCookie) ownerCookie = cookieFrom(response);
  return response;
}

async function json(response: Response): Promise<JsonObject> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON from ${response.url}; received ${response.status}: ${text.slice(0, 240)}`);
  }
}

async function expectStatus(response: Response, expected: number, label: string) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function expectJson(response: Response, expected: number, label: string) {
  await expectStatus(response, expected, label);
  return json(response);
}

async function expectJsonCreated(response: Response, label: string) {
  if (response.status !== 200 && response.status !== 201) {
    const body = await response.text();
    throw new Error(`${label}: expected HTTP 200 or 201, received ${response.status}: ${body.slice(0, 500)}`);
  }
  return json(response);
}

function randomName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function upload(galleryId: string, role: "capture" | "artwork" | "reference", name: string) {
  const body = new FormData();
  body.set("galleryId", galleryId);
  body.set("role", role);
  body.append("files", new File([fixturePng], name, { type: "image/png" }));
  return expectJsonCreated(await request("/api/assets", { method: "POST", body }, { owner: true }), `upload ${role}`);
}

async function pollJob(jobId: string) {
  const deadline = Date.now() + pollTimeoutMs;
  const terminal = new Set(["READY", "FAILED"]);
  let last: JsonObject | undefined;
  while (Date.now() < deadline) {
    const response = await request(`/api/jobs/${encodeURIComponent(jobId)}`, {}, { owner: true });
    const job = await expectJson(response, 200, "poll reconstruction job");
    last = job;
    if (terminal.has(job.status)) {
      if (job.status !== "READY") {
        throw new Error(`Measured-plan job failed at ${job.status}: ${job.error ?? job.message ?? "unknown error"}`);
      }
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out after ${pollTimeoutMs}ms waiting for job ${jobId}; last status=${last?.status ?? "unknown"}`);
}

async function main() {
  console.log(`Gallery Twin API flow: ${baseUrl}`);

  const sessionResponse = await request("/api/session");
  const session = await expectJson(sessionResponse, 200, "create owner session");
  assert.equal(session.ok, true, "session response should confirm an owner session");
  assert.ok(ownerCookie, "GET /api/session must establish the documented HttpOnly owner cookie");

  const gallery = await expectJsonCreated(
    await request("/api/galleries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: randomName("API flow gallery"), address: "Local test venue" }),
    }, { owner: true }),
    "create gallery",
  );
  assert.ok(gallery.gallery?.id, "gallery creation must return GalleryDetail.gallery.id");
  const galleryId = gallery.gallery.id as string;
  let detail = gallery;

  const captureUpload = await upload(galleryId, "capture", "api-flow-capture.png");
  const capture = captureUpload.assets?.[0] ?? captureUpload[0];
  assert.ok(capture?.id, "capture upload must return an asset id");

  const artworkUpload = await upload(galleryId, "artwork", "api-flow-artwork.png");
  const artworkAsset = artworkUpload.assets?.[0] ?? artworkUpload[0];
  assert.ok(artworkAsset?.id, "artwork upload must return an asset id");

  const job = await expectJsonCreated(
    await request("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ galleryId, mode: "measured-plan", assetIds: [capture.id] }),
    }, { owner: true }),
    "enqueue measured-plan job",
  );
  assert.ok(job.id, "job enqueue must return a job id");
  await pollJob(job.id);

  detail = await expectJson(await request(`/api/galleries/${galleryId}`, {}, { owner: true }), 200, "reload gallery after worker");
  assert.equal(detail.gallery.id, galleryId);
  assert.ok(detail.scene, "a READY measured-plan job must persist a scene");
  assert.ok(detail.scene.walls?.length, "measured-plan scene must contain walls");

  const artwork = await expectJsonCreated(
    await request("/api/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        galleryId,
        title: "API flow 600 × 900",
        imageUrl: `/api/assets/${artworkAsset.id}`,
        widthMm: 600,
        heightMm: 900,
        depthMm: 40,
        frameWidthMm: 0,
        frameDepthMm: 20,
      }),
    }, { owner: true }),
    "create 600x900 artwork",
  );
  assert.equal(artwork.widthMm, 600);
  assert.equal(artwork.heightMm, 900);

  const wall = detail.scene.walls[0];
  const placement = {
    id: `placement-${Date.now()}`,
    artworkId: artwork.id,
    wallId: wall.id,
    // The supplied measured proxy's first wall is 3.85m long and 2.74m high.
    // Keep the center comfortably inside its bounds for either endpoint convention.
    u: 1.1,
    v: 1.6,
    rotation: 0,
    locked: false,
  };
  const exhibition = detail.exhibition;
  const initialRevision = exhibition.revision;
  const saved = await expectJson(
    await request(`/api/exhibitions/${exhibition.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: initialRevision, title: "API flow exhibition", placements: [placement] }),
    }, { owner: true }),
    200,
    "save artwork placement",
  );
  assert.equal(saved.placements.length, 1);

  const concurrentRevision = saved.revision as number;
  const concurrentBody = (title: string) => ({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: concurrentRevision, title, placements: [placement] }),
  });
  const concurrentResponses = await Promise.all([
    request(`/api/exhibitions/${exhibition.id}`, concurrentBody("concurrent A"), { owner: true }),
    request(`/api/exhibitions/${exhibition.id}`, concurrentBody("concurrent B"), { owner: true }),
  ]);
  const concurrentStatuses = concurrentResponses.map((response) => response.status).sort((a, b) => a - b);
  assert.deepEqual(concurrentStatuses, [200, 409], "concurrent saves with one expectedRevision must serialize to exactly one success and one conflict");
  for (const response of concurrentResponses) if (response.status === 200) await response.arrayBuffer(); else await response.text();

  const reloaded = await expectJson(await request(`/api/galleries/${galleryId}`, {}, { owner: true }), 200, "reload saved exhibition");
  assert.equal(reloaded.exhibition.placements.length, 1, "placement must survive a reload");
  assert.equal(reloaded.artworks[0].widthMm, 600, "reload must preserve artwork width in mm");
  assert.equal(reloaded.artworks[0].heightMm, 900, "reload must preserve artwork height in mm");
  assert.equal(reloaded.scene.kind, "measured-plan", "the measured-plan worker must preserve scene provenance");
  assert.notEqual(reloaded.scene.visual.kind, "mesh", "a measured proxy must not claim a photorealistic mesh");
  assert.notEqual(reloaded.scene.visual.kind, "splat", "a measured proxy must not claim a Gaussian splat");

  const sceneUpdate = await expectJson(
    await request(`/api/galleries/${galleryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: reloaded.scene, placements: reloaded.exhibition.placements, expectedRevision: reloaded.exhibition.revision }),
    }, { owner: true }),
    200,
    "validate existing placement while updating scene",
  );
  assert.equal(sceneUpdate.id, reloaded.scene.id);
  const afterSceneUpdate = await expectJson(await request(`/api/galleries/${galleryId}`, {}, { owner: true }), 200, "reload scene placement update");
  assert.equal(afterSceneUpdate.exhibition.placements.length, 1, "scene update must retain the existing valid placement");

  // Freeze a share before calibration. The later scene mutation must not alter it.
  const share = await expectJsonCreated(
    await request("/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exhibitionId: exhibition.id }),
    }, { owner: true }),
    "create immutable share",
  );
  assert.ok(share.token, "share creation must return a capability token");
  const token = share.token as string;

  const staleResponse = await request(`/api/exhibitions/${exhibition.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: initialRevision, title: "stale write", placements: [placement] }),
  }, { owner: true });
  await expectStatus(staleResponse, 409, "reject stale exhibition revision");

  const preCalibrationArt = reloaded.artworks.find((item: JsonObject) => item.id === artwork.id);
  const calibratedScene = {
    ...reloaded.scene,
    version: reloaded.scene.version + 1,
    calibration: {
      status: "user",
      source: "api-flow-test",
      scaleFactor: 1.25,
      referenceDistanceM: 1,
      points: [[0, 0, 0], [1, 0, 0]],
    },
  };
  const patchedScene = await expectJson(
    await request(`/api/galleries/${galleryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: calibratedScene }),
    }, { owner: true }),
    200,
    "atomically update scene calibration",
  );
  assert.equal(patchedScene.calibration.status, "user");
  const afterCalibration = await expectJson(await request(`/api/galleries/${galleryId}`, {}, { owner: true }), 200, "reload calibrated gallery");
  const postCalibrationArt = afterCalibration.artworks.find((item: JsonObject) => item.id === artwork.id);
  assert.equal(postCalibrationArt.widthMm, preCalibrationArt.widthMm, "calibration must not scale artwork width in mm");
  assert.equal(postCalibrationArt.heightMm, preCalibrationArt.heightMm, "calibration must not scale artwork height in mm");

  const guestSnapshotResponse = await request(`/api/shares/${encodeURIComponent(token)}`);
  const guestSnapshot = await expectJson(guestSnapshotResponse, 200, "read share as guest");
  assert.equal(guestSnapshot.token, token);
  assert.equal(guestSnapshot.exhibition.placements.length, 1);
  assert.equal("assets" in guestSnapshot, false, "public share must not expose the gallery asset list");
  assert.equal(guestSnapshot.scene.id, reloaded.scene.id, "share must freeze the scene identity");
  assert.notEqual(guestSnapshot.scene.calibration.source, "api-flow-test", "share created before calibration must remain immutable");

  const privateCaptureResponse = await request(`/api/assets/${encodeURIComponent(capture.id)}`);
  assert.ok([401, 403].includes(privateCaptureResponse.status), `deny private capture to unauthenticated guest: expected HTTP 401 or 403, received ${privateCaptureResponse.status}`);

  const sharedImageUrl = guestSnapshot.artworks[0]?.imageUrl as string;
  assert.match(sharedImageUrl, new RegExp(`/api/shares/${token}/assets/`), "shared artwork must use a token-scoped derivative URL");
  const sharedImageResponse = await request(sharedImageUrl);
  await expectStatus(sharedImageResponse, 200, "allow shared artwork derivative to guest");

  const revokeResponse = await request(`/api/shares/${encodeURIComponent(token)}`, { method: "DELETE" }, { owner: true });
  assert.ok([200, 204].includes(revokeResponse.status), `revoke share: expected HTTP 200 or 204, received ${revokeResponse.status}`);
  const revokedGuest = await request(`/api/shares/${encodeURIComponent(token)}`);
  assert.ok([403, 404, 410].includes(revokedGuest.status), `revoked share should be inaccessible, received ${revokedGuest.status}`);

  console.log("PASS: session, gallery, upload, measured-plan worker, placement revisioning, calibration invariants, scoped share, and revocation");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
