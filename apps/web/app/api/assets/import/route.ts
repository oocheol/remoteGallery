import { NextRequest, NextResponse } from "next/server";
import { get, del } from "@vercel/blob";
import { requireOwner } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { createAsset, getGallery } from "@/lib/server/store";
import { saveUpload, validateUpload } from "@/lib/server/storage";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
    if (process.env.GALLERY_CLOUD !== "1")
      throw new ApiError(404, "CLOUD_ONLY", "Cloud uploads are not enabled");
    const input = (await readJson(request)) as Record<string, unknown>;
    const galleryId = requiredString(input.galleryId, "galleryId"),
      role = requiredString(input.role, "role"),
      pathname = requiredString(input.pathname, "pathname");
    if (!/^incoming\/[a-zA-Z0-9_-]+$/.test(pathname))
      throw new ApiError(
        400,
        "INVALID_UPLOAD",
        "Upload destination is invalid",
      );
    await getGallery(galleryId);
    const blob = await get(pathname, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200 || blob.blob.size > 120 * 1024 * 1024)
      throw new ApiError(
        400,
        "INVALID_UPLOAD",
        "Uploaded file is unavailable or too large",
      );
    const file = new File(
      [await new Response(blob.stream).arrayBuffer()],
      requiredString(input.name, "name"),
      { type: blob.blob.contentType },
    );
    await validateUpload(file, role);
    const record = await saveUpload(galleryId, file, role);
    const asset = await createAsset({
      id: record.id,
      gallery_id: galleryId,
      name: record.name,
      mime_type: record.mimeType,
      size_bytes: record.size,
      role: role as "capture" | "artwork" | "reference",
      storage_path: record.path,
      public_derivative: role === "artwork",
    });
    await del(pathname);
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
