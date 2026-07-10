import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { listApprovedCollections } from "@/lib/rag/collections";

/**
 * Read-only, APPROVED-only list of collections for the Collections page.
 * Same visibility as the chat — see lib/rag/collections.ts.
 */
export async function GET() {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  try {
    const collections = await listApprovedCollections();
    return NextResponse.json({ ok: true, collections });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load collections.",
      },
      { status: 500 },
    );
  }
}
