import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@gallery/db";
import { requireOwner } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  readJson,
  requiredString,
} from "@/lib/server/http";
import { getGalleryDetail } from "@/lib/server/store";
import type { ShareSnapshot } from "@gallery/shared";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const exhibitionId = requiredString(body.exhibitionId, "exhibitionId");
    const db = await getDatabase();
    const result = await db.query<{ gallery_id: string }>(
      "SELECT gallery_id FROM exhibitions WHERE id=$1",
      [exhibitionId],
    );
    const row = result.rows[0];
    if (!row)
      throw new ApiError(404, "EXHIBITION_NOT_FOUND", "Exhibition not found");
    const detail = await getGalleryDetail(row.gallery_id);
    if (!detail.scene)
      throw new ApiError(
        400,
        "SCENE_REQUIRED",
        "A scene is required before sharing",
      );
    const token = randomBytes(24).toString("base64url");
    const scene = structuredClone(detail.scene);
    const rewrite = (url?: string) =>
      url?.match(/^\/api\/assets\/([\w-]+)$/)?.[1]
        ? `/api/shares/${token}/assets/${url.match(/^\/api\/assets\/([\w-]+)$/)![1]}`
        : url;
    if (scene.visual.url) scene.visual.url = rewrite(scene.visual.url);
    const snapshot: ShareSnapshot = {
      token,
      exhibition: structuredClone(detail.exhibition),
      scene,
      artworks: detail.artworks
        .filter((art) =>
          detail.exhibition.placements.some((p) => p.artworkId === art.id),
        )
        .map((art) => ({
          ...art,
          matSizing: "inset" as const,
          frameSizing: "inset" as const,
          imageUrl: rewrite(art.imageUrl) || "",
        })),
      galleryName: detail.gallery.name,
      createdAt: new Date().toISOString(),
    };
    await db.query(
      "INSERT INTO shares(token,exhibition_id,gallery_id,snapshot,created_at) VALUES($1,$2,$3,$4,$5)",
      [
        token,
        exhibitionId,
        row.gallery_id,
        JSON.stringify(snapshot),
        snapshot.createdAt,
      ],
    );
    return NextResponse.json(
      { token, url: `/exhibition/${token}` },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
