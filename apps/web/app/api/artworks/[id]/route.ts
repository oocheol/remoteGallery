import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/server/auth";
import { apiError, readJson } from "@/lib/server/http";
import { deleteArtwork } from "@/lib/server/store";
export const runtime = "nodejs";
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner(request);
    const body = (await readJson(request)) as { expectedRevision?: unknown };
    return NextResponse.json(
      await deleteArtwork((await context.params).id, body?.expectedRevision),
    );
  } catch (error) {
    return apiError(error);
  }
}
