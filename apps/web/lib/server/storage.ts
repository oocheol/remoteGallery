import sharp from "sharp";
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

const roots = () => ({
  storage: resolve(process.env.GALLERY_STORAGE_DIR || ".gallery-twin/storage"),
  jobs: resolve(process.env.GALLERY_JOBS_DIR || ".gallery-twin/jobs"),
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
  "video/quicktime": ".mov",
  "video/mp4": ".mp4",
  "application/json": ".json",
};
const accepted = new Set(Object.keys(mimeExtensions));
const maximumSize = 120 * 1024 * 1024;

export async function validateUpload(file: File, role: string) {
  if (!accepted.has(file.type) || file.size <= 0 || file.size > maximumSize)
    throw new ApiError(
      400,
      "UNSUPPORTED_UPLOAD",
      "Upload type or size is not supported",
    );
  if (!["capture", "artwork", "reference"].includes(role))
    throw new ApiError(400, "INVALID_ROLE", "Asset role is invalid");
  if (role === "artwork" && !file.type.startsWith("image/"))
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
  const valid =
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/png" && png) ||
    ((file.type === "image/heic" || file.type === "image/heif") && heic) ||
    ((file.type === "video/quicktime" || file.type === "video/mp4") && movie);
  if (!valid)
    throw new ApiError(
      400,
      "UPLOAD_SIGNATURE_INVALID",
      "File contents do not match its declared type",
    );
}

export async function saveUpload(galleryId: string, file: File, role: string) {
  const { storage } = roots();
  const id = randomUUID();
  const ext = mimeExtensions[file.type] || extname(file.name).toLowerCase();
  const dir = safeJoin(storage, galleryId);
  await mkdir(dir, { recursive: true });
  const originalPath = safeJoin(dir, `${id}${ext}`);
  await writeFile(originalPath, Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    (role === "artwork" && file.type.startsWith("image/"))
  ) {
    const normalizedPath = safeJoin(dir, `${id}.normalized.jpg`);
    const finalPath = safeJoin(dir, `${id}.jpg`);
    try {
      let sourcePath = originalPath;
      const heicPath = safeJoin(dir, `${id}.decoded.jpg`);
      if (file.type === "image/heic" || file.type === "image/heif") {
        await run(
          "sips",
          ["-s", "format", "jpeg", originalPath, "--out", heicPath],
          30_000,
        );
        sourcePath = heicPath;
      }
      // Sharp strips EXIF/XMP/IPTC by default. Rotate from EXIF first, bound texture size.
      await sharp(sourcePath, { limitInputPixels: 80_000_000 })
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
      return {
        id,
        path: finalPath,
        name: safeName(file.name, ".jpg"),
        mimeType: "image/jpeg",
        size: (await readFile(finalPath)).byteLength,
      };
    } catch {
      await Promise.all(
        [originalPath, normalizedPath, safeJoin(dir, `${id}.decoded.jpg`)].map(
          (p) => rm(p, { force: true }),
        ),
      );
      throw new ApiError(
        422,
        "IMAGE_NORMALIZATION_FAILED",
        "This image could not be normalized",
      );
    }
  }
  return {
    id,
    path: originalPath,
    name: safeName(file.name, ext),
    mimeType: file.type,
    size: file.size,
  };
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

export async function readPrivateAsset(path: string) {
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
