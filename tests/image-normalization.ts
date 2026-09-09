import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import sharp from "sharp";
import { uploadMimeType } from "../apps/web/lib/upload-types";
import { saveUpload, validateUpload } from "../apps/web/lib/server/storage";

const tempRoot = await realpath(tmpdir());
const directory = await realpath(await mkdtemp(join(tempRoot, "gallery-image-test-")));
const inside = (root: string, target: string) => {
  const path = relative(root, target);
  return path !== "" && !isAbsolute(path) && path !== ".." && !path.startsWith("..\\") && !path.startsWith("../");
};
assert.ok(inside(tempRoot, directory), "test cleanup target must be beneath the OS temp directory");
const previousStorage = process.env.GALLERY_STORAGE_DIR;
const previousCloud = process.env.GALLERY_CLOUD;
process.env.GALLERY_STORAGE_DIR = directory;
delete process.env.GALLERY_CLOUD;

async function tiffFixture() {
  // RGBA + LZW TIFF exercises a non-JPEG source colour layout. Orientation 6
  // swaps dimensions during JPEG normalization.
  return sharp({ create: { width: 4100, height: 200, channels: 4, background: "#202030" } })
    .withMetadata({
      orientation: 6,
      exif: { IFD0: { ImageDescription: "private TIFF metadata" } },
      xmp: "<x:xmpmeta>private TIFF metadata</x:xmpmeta>",
    })
    .withIccProfile("srgb")
    .tiff({ compression: "lzw", predictor: "horizontal" })
    .toBuffer();
}

async function assertNormalizedTiff(role: "artwork" | "reference" | "capture", type: string, name: string, bytes: Buffer) {
  const file = new File([bytes], name, { type });
  await validateUpload(file, role);
  const result = await saveUpload(`fixture-${role}`, file, role);
  assert.equal(result.mimeType, "image/jpeg");
  assert.match(result.name, /\.jpg$/i);
  const metadata = await sharp(await readFile(result.path)).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 200, "auto-orientation should swap TIFF dimensions");
  assert.equal(metadata.height, 4096, "normalized JPEG must be bounded to 4096px");
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.icc, undefined);
}

try {
  const tiff = await tiffFixture();
  const sourceMetadata = await sharp(tiff).metadata();
  assert.equal(sourceMetadata.format, "tiff");
  assert.equal(sourceMetadata.orientation, 6);
  assert.ok(sourceMetadata.icc, "fixture must contain metadata that normalization removes");

  const jpeg = await sharp({ create: { width: 200, height: 300, channels: 3, background: "#202030" } })
    .withMetadata({ exif: { IFD0: { ImageDescription: "private JPEG metadata" } } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif);
  const jpegFile = new File([jpeg], "original.jpg", { type: "image/jpeg" });
  await validateUpload(jpegFile, "artwork");
  const jpegResult = await saveUpload("jpeg-regression", jpegFile, "artwork");
  const jpegMetadata = await sharp(await readFile(jpegResult.path)).metadata();
  assert.equal(jpegMetadata.width, 200);
  assert.equal(jpegMetadata.height, 300);
  assert.equal(jpegMetadata.exif, undefined);
  assert.equal(jpegMetadata.xmp, undefined);

  const pageWidth = 48;
  const pageHeight = 64;
  const firstPageBytes = pageWidth * pageHeight * 3;
  const pages = Buffer.alloc(firstPageBytes * 2);
  pages.fill(Buffer.from([220, 20, 10]), 0, firstPageBytes);
  pages.fill(Buffer.from([10, 20, 220]), firstPageBytes);
  const multipageTiff = await sharp(pages, {
    raw: { width: pageWidth, height: pageHeight * 2, channels: 3, pageHeight },
  }).tiff({ compression: "lzw" }).toBuffer();
  const multipageMetadata = await sharp(multipageTiff, { pages: -1 }).metadata();
  assert.equal(multipageMetadata.pages, 2, "fixture must be a true two-page TIFF");
  assert.equal(multipageMetadata.pageHeight, pageHeight);

  const bigTiff = await sharp({ create: { width: 4100, height: 200, channels: 3, background: "#305070" } })
    .withMetadata({ orientation: 6 })
    .tiff({ compression: "lzw", bigtiff: true })
    .toBuffer();
  assert.deepEqual([...bigTiff.subarray(0, 8)], [0x49, 0x49, 0x2b, 0x00, 0x08, 0x00, 0x00, 0x00]);

  // The same resolver is used by the browser's cloud upload preparation and
  // server-side validation, so aliases must resolve before either route runs.
  assert.equal(uploadMimeType({ name: "standard.tiff", type: "image/tiff" }), "image/tiff");
  assert.equal(uploadMimeType({ name: "legacy.TIF", type: "image/x-tiff" }), "image/tiff");
  assert.equal(uploadMimeType({ name: "camera.tIfF", type: "" }), "image/tiff");
  assert.equal(uploadMimeType({ name: "generic.TIFF", type: "application/octet-stream" }), "image/tiff");
  assert.equal(uploadMimeType({ name: "generic.bin", type: "application/octet-stream" }), "application/octet-stream");

  await assertNormalizedTiff("artwork", "image/tiff", "standard.tiff", tiff);
  await assertNormalizedTiff("reference", "image/tiff", "large-container.tiff", bigTiff);
  await assertNormalizedTiff("reference", "image/x-tiff", "legacy.TIF", tiff);
  await assertNormalizedTiff("capture", "", "camera.tIfF", tiff);
  await assertNormalizedTiff("artwork", "application/octet-stream", "generic.TIFF", tiff);

  const multipageFile = new File([multipageTiff], "two-pages.tiff", { type: "image/tiff" });
  await validateUpload(multipageFile, "capture");
  const multipageResult = await saveUpload("multipage-tiff", multipageFile, "capture");
  const normalizedPage = sharp(await readFile(multipageResult.path));
  const normalizedPageMetadata = await normalizedPage.metadata();
  assert.equal(normalizedPageMetadata.width, pageWidth);
  assert.equal(normalizedPageMetadata.height, pageHeight, "only the first TIFF page may be normalized");
  const firstPixel = await normalizedPage.raw().toBuffer();
  assert.ok(firstPixel[0] > 150 && firstPixel[2] < 80, "normalized TIFF must use page one's red pixels, not page two");

  await assert.rejects(() => validateUpload(new File(["not an image"], "fake.jpg", { type: "image/jpeg" }), "artwork"));
  await assert.rejects(() => validateUpload(new File(["not a TIFF"], "spoof.tiff", { type: "image/tiff" }), "artwork"));
  const highResolutionTiff = await sharp({ create: { width: 10000, height: 9000, channels: 3, background: "#796548" } }).tiff({ compression: "lzw" }).toBuffer();
  const highResolution = await saveUpload("90mp-tiff", new File([highResolutionTiff], "large.tif", { type: "image/tiff" }), "artwork");
  const highMetadata = await sharp(await readFile(highResolution.path)).metadata();
  assert.equal(highMetadata.width, 4096, "TIFF above the former 80MP limit should normalize");
  assert.equal(highMetadata.height, 3686);
  const truncated = new File([tiff.subarray(0, 12)], "truncated.tiff", { type: "image/tiff" });
  await validateUpload(truncated, "reference");
  await assert.rejects(() => saveUpload("failed-tiff", truncated, "reference"));
  assert.deepEqual(await readdir(join(directory, "failed-tiff")), [], "failed TIFF normalization must remove its temporary files");
  console.log("PASS: JPEG and TIFF normalization strips metadata; TIFF MIME aliases normalize every role and reject spoofed/truncated inputs without artifacts");
} finally {
  if (previousStorage === undefined) delete process.env.GALLERY_STORAGE_DIR;
  else process.env.GALLERY_STORAGE_DIR = previousStorage;
  if (previousCloud === undefined) delete process.env.GALLERY_CLOUD;
  else process.env.GALLERY_CLOUD = previousCloud;
  // directory was realpath-verified above, so recursive cleanup is confined to this test's temp folder.
  await rm(directory, { recursive: true, force: true });
}
