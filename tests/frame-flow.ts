import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type {
  GalleryDetail,
  Artwork,
  Scene,
  Placement,
  ShareSnapshot,
} from "@gallery/shared";

const base = process.env.GALLERY_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const session = await fetch(base + "/api/session");
const cookie = session.headers.get("set-cookie")!.split(";")[0];
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  status = 200,
): Promise<T> {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
const gallery = await api<GalleryDetail>(
  "/api/galleries",
  "POST",
  { name: "액자·여백 검증 " + Date.now(), address: "자동 검증용 별도 공간" },
  201,
);
const id = gallery.gallery.id;
const path = `/api/galleries/${id}`;
const scene: Scene = {
  id: randomUUID(),
  galleryId: id,
  version: 1,
  name: "액자 미리보기",
  kind: "manual",
  walls: [
    {
      id: "wall",
      name: "전시 벽",
      start: [0, 0],
      end: [4, 0],
      height: 3,
      thickness: 0.1,
    },
  ],
  floor: {
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    y: 0,
  },
  calibration: { status: "user", source: "test fixture", scaleFactor: 1 },
  visual: { kind: "none" },
  warnings: [],
};
await api(path, "PATCH", { scene });
const image = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31536a"/><circle cx="290" cy="300" r="170" fill="#db9a62"/><path d="M0 700L320 420 600 780V900H0Z" fill="#8da09b"/></svg>',
  ),
)
  .png()
  .toBuffer();
const form = new FormData();
form.set("galleryId", id);
form.set("role", "artwork");
form.append(
  "files",
  new File([image], "frame-fixture.png", { type: "image/png" }),
);
const assets = await api<{ url: string }[]>("/api/assets", "POST", form, 201);
const art = await api<Artwork>(
  "/api/artworks",
  "POST",
  {
    galleryId: id,
    title: "액자 테스트 작품",
    imageUrl: assets[0].url,
    widthMm: 600,
    heightMm: 900,
  },
  201,
);
assert.equal(art.matWidthMm, 0);
assert.equal(art.frameMaterial, "black");
const placement: Placement = {
  id: randomUUID(),
  artworkId: art.id,
  wallId: "wall",
  u: 1.2,
  v: 1.5,
  rotation: 0,
  locked: false,
};
let detail = await api<GalleryDetail>(path);
const save = (
  artworkStyles: unknown[],
  placements: Placement[] = [placement],
  expectedRevision = detail.exhibition.revision,
  status = 200,
) =>
  api(
    path,
    "PATCH",
    { scene, placements, expectedRevision, artworkStyles },
    status,
  );
const plain = {
  id: art.id,
  frameMaterial: "black",
  frameWidthMm: 0,
  frameDepthMm: 0,
  matWidthMm: 0,
};
const wood = {
  ...plain,
  frameMaterial: "wood",
  frameWidthMm: 20,
  frameDepthMm: 25,
  matWidthMm: 50,
};
const pair = [placement, { ...placement, id: randomUUID(), u: 1.9 }];
await save([plain], pair);
detail = await api<GalleryDetail>(path);
await save([wood], pair, detail.exhibition.revision, 400);
assert.equal(
  (await api<GalleryDetail>(path)).artworks[0].matWidthMm,
  0,
  "failed mat collision must roll back style",
);
await save([wood]);
detail = await api<GalleryDetail>(path);
assert.equal(detail.artworks[0].frameMaterial, "wood");
assert.equal(detail.artworks[0].matWidthMm, 50);
assert.equal(detail.artworks[0].widthMm, 600);
assert.equal(detail.artworks[0].heightMm, 900);
const savedRevision = detail.exhibition.revision;
for (const invalid of [
  { ...wood, matWidthMm: -1 },
  { ...wood, frameMaterial: "metal" },
  { ...wood, id: randomUUID() },
  { ...wood, frameWidthMm: 1000, matWidthMm: 1000 },
])
  await save([invalid], [placement], savedRevision, 400);
assert.equal(
  (await api<GalleryDetail>(path)).exhibition.revision,
  savedRevision,
  "invalid requests must not change revision",
);
await save([plain], [placement], savedRevision - 1, 409);
const share = await api<{ token: string; url: string }>(
  "/api/shares",
  "POST",
  { exhibitionId: detail.exhibition.id },
  201,
);
await save([{ ...wood, frameMaterial: "black", matWidthMm: 30 }]);
detail = await api<GalleryDetail>(path);
assert.equal(detail.artworks[0].frameMaterial, "black");
assert.equal(detail.artworks[0].matWidthMm, 30);
const guest = await fetch(base + "/api/shares/" + share.token);
assert.equal(guest.status, 200);
const snapshot: ShareSnapshot = await guest.json();
assert.equal(snapshot.artworks[0].frameMaterial, "wood");
assert.equal(
  snapshot.artworks[0].matWidthMm,
  50,
  "share remains immutable after style edits",
);
await mkdir(".gallery-twin", { recursive: true });
await writeFile(
  ".gallery-twin/frame-check.json",
  JSON.stringify({ galleryId: id, artworkId: art.id, shareToken: share.token }),
);
console.log(
  "PASS: frame/mat defaults, save/reload, collision and boundary rollback, input validation, stale revision, immutable guest rendering data.",
);
