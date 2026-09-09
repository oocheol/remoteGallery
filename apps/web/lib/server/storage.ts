import sharp from "sharp";
import { get, put } from "@vercel/blob";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { ApiError } from "./http";
import { uploadMimeType } from "../upload-types";

const roots = () => ({
  storage: resolve(
    process.env.GALLERY_CLOUD === "1"
      ? "/tmp/gallery-twin/storage"
      : process.env.GALLERY_STORAGE_DIR || ".gallery-twin/storage",
  ),
  jobs: resolve(
    process.env.GALLERY_CLOUD === "1"
      ? "/tmp/gallery-twin/jobs"
      : process.env.GALLERY_JOBS_DIR || ".gallery-twin/jobs",
  ),
});
export const jobDirectory = (jobId: string) => safeJoin(roots().jobs, jobId);
export const safeJoin = (root: string, ...parts: string[]) => {
  const path = resolve(root, ...parts);
  if (relative(root, path).startsWith("..") || relative(root, path) === "..")
    throw new ApiError(400, "INVALID_PATH", "Invalid storage path");
  return path;
};

const mimeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heic",
  "image/tiff": ".tiff",
  "video/quicktime": ".mov",
  "video/mp4": ".mp4",
  "application/json": ".json",
};
const accepted = new Set(Object.keys(mimeExtensions));
const maximumSize = 120 * 1024 * 1024;

export async function validateUpload(file: File, role: string) {
  const mimeType = uploadMimeType(file);
  if (!accepted.has(mimeType) || file.size <= 0 || file.size > maximumSize)
    throw new ApiError(
      400,
      "UNSUPPORTED_UPLOAD",
      "지원하지 않는 형식이거나 파일이 비어 있습니다. JPEG·PNG·HEIC·TIFF 파일은 120MB 이하로 올려 주세요.",
    );
  if (!["capture", "artwork", "reference"].includes(role))
    throw new ApiError(400, "INVALID_ROLE", "Asset role is invalid");
  if (role === "artwork" && !mimeType.startsWith("image/"))
    throw new ApiError(
      400,
      "UNSUPPORTED_UPLOAD",
      "Artwork uploads must be images",
    );
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ascii = new TextDecoder().decode(bytes);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const iso = ascii.slice(4, 8) === "ftyp";
  const heic = iso && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8, 32));
  const movie = iso && !heic;
  const tiff =
    (bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
    (bytes[0] === 0x4d &&
      bytes[1] === 0x4d &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x2a) ||
    (bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2b &&
      bytes[3] === 0x00 &&
      bytes[4] === 0x08 &&
      bytes[5] === 0x00 &&
      bytes[6] === 0x00 &&
      bytes[7] === 0x00) ||
    (bytes[0] === 0x4d &&
      bytes[1] === 0x4d &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x2b &&
      bytes[4] === 0x00 &&
      bytes[5] === 0x08 &&
      bytes[6] === 0x00 &&
      bytes[7] === 0x00);
  const valid =
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/png" && png) ||
    ((mimeType === "image/heic" || mimeType === "image/heif") && heic) ||
    (mimeType === "image/tiff" && tiff) ||
    ((mimeType === "video/quicktime" || mimeType === "video/mp4") && movie);
  if (!valid)
    throw new ApiError(
      400,
      "UPLOAD_SIGNATURE_INVALID",
      "파일 확장자와 실제 이미지 형식이 일치하지 않거나 파일이 손상되었습니다. 원본 프로그램에서 다시 내보내 주세요.",
    );
}

export async function saveUpload(galleryId: string, file: File, role: string) {
  const { storage } = roots();
  const id = randomUUID();
  const mimeType = uploadMimeType(file);
  const ext = mimeExtensions[mimeType] || extname(file.name).toLowerCase();
  const dir = safeJoin(storage, galleryId);
  await mkdir(dir, { recursive: true });
  const originalPath = safeJoin(dir, `${id}${ext}`);
  await writeFile(originalPath, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  if (
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType === "image/tiff" ||
    (role === "artwork" && mimeType.startsWith("image/"))
  ) {
    const normalizedPath = safeJoin(dir, `${id}.normalized.jpg`);
    const finalPath = safeJoin(dir, `${id}.jpg`);
    try {
      let sourcePath = originalPath;
      const heicPath = safeJoin(dir, `${id}.decoded.jpg`);
      if (mimeType === "image/heic" || mimeType === "image/heif") {
        if (process.platform === "darwin") {
          await run(
            "sips",
            ["-s", "format", "jpeg", originalPath, "--out", heicPath],
            30_000,
          );
        } else {
          const convert = (await import("heic-convert")).default;
          await writeFile(
            heicPath,
            await convert({
              buffer: await readFile(originalPath),
              format: "JPEG",
              quality: 0.95,
            }),
          );
        }
        sourcePath = heicPath;
      }
      // Sharp strips EXIF/XMP/IPTC by default. Rotate from EXIF first, bound texture size.
      await sharp(sourcePath, {
        limitInputPixels: 200_000_000,
        page: 0,
        pages: 1,
      })
        .autoOrient()
        .resize({
          width: 4096,
          height: 4096,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 90 })
        .toFile(normalizedPath);
      await rm(originalPath);
      await rm(heicPath, { force: true });
      await rename(normalizedPath, finalPath);
    } catch (error) {
      await Promise.all(
        [originalPath, normalizedPath, safeJoin(dir, `${id}.decoded.jpg`)].map(
          (p) => rm(p, { force: true }),
        ),
      );
      const reason =
        error instanceof Error ? error.message : "Unknown image error";
      console.error("Image normalization failed", { mimeType, reason });
      throw new ApiError(
        422,
        "IMAGE_NORMALIZATION_FAILED",
        /pixel limit/i.test(reason)
          ? "이미지 해상도가 2억 픽셀 제한을 초과했습니다. 가로 × 세로가 200,000,000 이하가 되도록 축소해 주세요."
          : "이미지를 변환하지 못했습니다. 파일이 손상되었거나 지원하지 않는 압축 방식일 수 있습니다. TIFF는 LZW 또는 무압축으로 다시 저장해 주세요.",
      );
    }
    return await persistUpload(galleryId, {
      id,
      path: finalPath,
      name: safeName(file.name, ".jpg"),
      mimeType: "image/jpeg",
      size: (await readFile(finalPath)).byteLength,
    });
  }

  return persistUpload(galleryId, {
    id,
    path: originalPath,
    name: safeName(file.name, ext),
    mimeType,
    size: file.size,
  });
}

export async function saveGeneratedFile(
  galleryId: string,
  sourcePath: string,
  mimeType: string,
  suggestedName: string,
  expectedOutputDir?: string,
) {
  const { storage } = roots();
  const source = resolve(sourcePath);
  // Generated derivatives are allowed only beneath the job output root.
  const permittedRoot = expectedOutputDir
    ? resolve(expectedOutputDir)
    : roots().jobs;
  let realSource: string;
  let realRoot: string;
  try {
    [realSource, realRoot] = await Promise.all([
      realpath(source),
      realpath(permittedRoot),
    ]);
  } catch {
    throw new ApiError(
      400,
      "INVALID_GENERATED_PATH",
      "Generated file is unavailable",
    );
  }
  if (
    relative(realRoot, realSource).startsWith("..") ||
    relative(realRoot, realSource) === ".."
  )
    throw new ApiError(
      400,
      "INVALID_GENERATED_PATH",
      "Generated file is outside worker output",
    );
  const id = randomUUID();
  const dir = safeJoin(storage, galleryId);
  await mkdir(dir, { recursive: true });
  const ext = mimeExtensions[mimeType] || extname(suggestedName) || ".bin";
  const target = safeJoin(dir, `${id}${ext}`);
  await rename(realSource, target);
  return {
    id,
    path: target,
    name: safeName(suggestedName, ext),
    mimeType,
    size: (await readFile(target)).byteLength,
  };
}

async function persistUpload(
  galleryId: string,
  record: {
    id: string;
    path: string;
    name: string;
    mimeType: string;
    size: number;
  },
) {
  if (process.env.GALLERY_CLOUD !== "1") return record;
  const blob = await put(
    `${galleryId}/${record.id}${extname(record.path)}`,
    await readFile(record.path),
    { access: "private", contentType: record.mimeType, addRandomSuffix: false },
  );
  await rm(record.path, { force: true });
  return { ...record, path: `blob:${blob.pathname}` };
}

export async function readPrivateAsset(path: string) {
  if (path.startsWith("blob:")) {
    if (process.env.GALLERY_CLOUD !== "1")
      throw new ApiError(
        404,
        "ASSET_MISSING",
        "Cloud asset is not available locally",
      );
    const blob = await get(path.slice(5), { access: "private" });
    if (!blob || blob.statusCode !== 200)
      throw new ApiError(404, "ASSET_MISSING", "Asset file is missing");
    return blob.stream;
  }
  const absolute = resolve(path);
  const { storage } = roots();
  if (relative(storage, absolute).startsWith(".."))
    throw new ApiError(
      403,
      "ASSET_PATH_DENIED",
      "Asset path is not authorized",
    );
  try {
    return await readFile(absolute);
  } catch {
    throw new ApiError(404, "ASSET_MISSING", "Asset file is missing");
  }
}

export async function writeWorkerManifest(jobId: string, manifest: unknown) {
  const dir = jobDirectory(jobId);
  await mkdir(dir, { recursive: true });
  const path = safeJoin(dir, "input.json");
  // Atomic replacement prevents a worker observing a partial manifest.
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(manifest));
  await rename(temp, path);
  return path;
}

function safeName(name: string, fallbackExt: string) {
  const cleaned =
    basename(name)
      .replace(/[^\w.\-() ]/g, "_")
      .slice(0, 120) || `upload${fallbackExt}`;
  return cleaned.toLowerCase().endsWith(fallbackExt)
    ? cleaned
    : `${cleaned}${fallbackExt}`;
}
function run(command: string, args: string[], timeout: number) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out"));
    }, timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolveRun() : reject(new Error(`${command} failed`));
    });
  });
}
