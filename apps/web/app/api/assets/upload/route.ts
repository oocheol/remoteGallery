import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireOwner } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { getGallery } from "@/lib/server/store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    if (process.env.GALLERY_CLOUD !== "1")
      throw new ApiError(404, "CLOUD_ONLY", "Cloud uploads are not enabled");
    const body = (await readJson(request)) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await requireOwner(request);
        const input = JSON.parse(clientPayload || "{}");
        await getGallery(requiredString(input.galleryId, "galleryId"));
        if (
          !/^incoming\/[a-zA-Z0-9_-]+$/.test(pathname) ||
          !["artwork", "capture", "reference"].includes(input.role)
        )
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "Upload destination is invalid",
          );
        return {
          allowedContentTypes:
            input.role === "artwork"
              ? ["image/jpeg", "image/png", "image/heic", "image/heif"]
              : [
                  "image/jpeg",
                  "image/png",
                  "image/heic",
                  "image/heif",
                  "video/quicktime",
                  "video/mp4",
                ],
          maximumSizeInBytes: 120 * 1024 * 1024,
          validUntil: Date.now() + 15 * 60_000,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
