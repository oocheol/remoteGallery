import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { createArtwork, getAssetRow } from "@/lib/server/store";
import type { Artwork } from "@gallery/shared";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const galleryId = requiredString(body.galleryId, "galleryId");
    const imageUrl = requiredString(body.imageUrl, "imageUrl");
    const assetId = imageUrl.match(/^\/api\/assets\/([\w-]+)$/)?.[1];
    if (!assetId)
      throw new ApiError(
        400,
        "INVALID_ARTWORK_IMAGE",
        "Artwork image must be an uploaded private asset",
      );
    const asset = await getAssetRow(assetId);
    if (asset.gallery_id !== galleryId || asset.role !== "artwork")
      throw new ApiError(
        400,
        "INVALID_ARTWORK_IMAGE",
        "Artwork asset does not belong to this gallery",
      );
    const numeric = (value: unknown, field: string, required = true) => {
      if (value === undefined && !required) return 0;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100_000 ||
        (required && value <= 0)
      )
        throw new ApiError(400, "INVALID_DIMENSIONS", `${field} is invalid`);
      return value;
    };
    const type = body.type ?? "image";
    if (type !== "image" && type !== "video" && type !== "sculpture")
      throw new ApiError(
        400,
        "INVALID_ARTWORK_TYPE",
        "Artwork type is invalid",
      );
    const artwork: Omit<Artwork, "id"> = {
      galleryId,
      title: requiredString(body.title, "title", 200),
      type,
      imageUrl,
      widthMm: numeric(body.widthMm, "widthMm"),
      heightMm: numeric(body.heightMm, "heightMm"),
      depthMm: numeric(body.depthMm, "depthMm", false),
      frameWidthMm: numeric(body.frameWidthMm, "frameWidthMm", false),
      frameDepthMm: numeric(body.frameDepthMm, "frameDepthMm", false),
    };
    return NextResponse.json(await createArtwork(artwork), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
