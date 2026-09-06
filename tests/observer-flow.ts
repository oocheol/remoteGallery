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
  { name: "관람자 검증 " + Date.now(), address: "자동 검증용 별도 공간" },
  201,
);
const id = gallery.gallery.id;
const path = `/api/galleries/${id}`;
const scene: Scene = {
  id: randomUUID(),
  galleryId: id,
  version: 1,
  name: "관람자 미리보기",
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
const observer = {
  id: randomUUID(),
  placementId: placement.id,
  heightMm: 1800,
};
const observedScene = { ...scene, observers: [observer] };
await api(path, "PATCH", {
  scene: observedScene,
  placements: [placement],
  expectedRevision: detail.exhibition.revision,
});
detail = await api<GalleryDetail>(path);
assert.deepEqual(detail.scene?.observers, [observer]);
const revision = detail.exhibition.revision;
for (const observers of [
  [{ ...observer, heightMm: 499 }],
  [{ ...observer, heightMm: 2501 }],
  [{ ...observer, placementId: "missing" }],
  [observer, observer],
  [observer, { ...observer, id: randomUUID() }],
])
  await api(
    path,
    "PATCH",
    {
      scene: { ...scene, observers },
      placements: [placement],
      expectedRevision: revision,
    },
    400,
  );
await api(path, "PATCH", { scene: { ...observedScene, observers: [] } }, 400);
await api(
  path,
  "PATCH",
  { scene: observedScene, expectedRevision: revision - 1 },
  409,
);
assert.equal((await api<GalleryDetail>(path)).exhibition.revision, revision);
const share = await api<{ token: string }>(
  "/api/shares",
  "POST",
  { exhibitionId: detail.exhibition.id },
  201,
);
await api(path, "PATCH", {
  scene: { ...scene, observers: [{ ...observer, heightMm: 1900 }] },
  expectedRevision: revision,
});
detail = await api<GalleryDetail>(path);
assert.equal(detail.scene?.observers?.[0].heightMm, 1900);
assert.equal(detail.exhibition.revision, revision + 1);
const snapshot: ShareSnapshot = await (
  await fetch(base + "/api/shares/" + share.token)
).json();
assert.deepEqual(snapshot.scene.observers, [observer]);
await api("/api/exhibitions/" + detail.exhibition.id, "PUT", {
  title: detail.exhibition.title,
  expectedRevision: detail.exhibition.revision,
  placements: [],
});
detail = await api<GalleryDetail>(path);
assert.deepEqual(detail.scene?.observers, []);
await api(path, "PATCH", {
  scene: observedScene,
  placements: [placement],
  expectedRevision: detail.exhibition.revision,
});
await mkdir(".gallery-twin", { recursive: true });
await writeFile(
  ".gallery-twin/observer-check.json",
  JSON.stringify({ galleryId: id, shareToken: share.token }),
);
console.log(
  "PASS: observer save/reload, height limits, duplicate and missing placement rejection, revision protection, immutable share and deletion cleanup.",
);
