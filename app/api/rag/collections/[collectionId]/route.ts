import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { getCollectionDetail } from "@/lib/rag/collections";

/**
 * Read-only, APPROVED-only, paginated detail for one collection — backs
 * the collection detail page. Same visibility as the chat — see
 * lib/rag/collections.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  try {
    const { collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1") || 1;
    const pageSize = Number(searchParams.get("pageSize") ?? "10") || 10;

    const detail = await getCollectionDetail(collectionId, page, pageSize);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "Collection not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load collection detail.",
      },
      { status: 500 },
    );
  }
}
