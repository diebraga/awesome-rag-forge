import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/storage";

/**
 * Read-only, APPROVED-only document download. Redirects to a short-lived
 * presigned URL rather than proxying bytes — the bucket stays private, and
 * this route never reads DRAFT/PENDING_REVIEW/REJECTED documents' files,
 * matching every other route's APPROVED-only visibility rule.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  try {
    const { id } = await params;
    const document = await prisma.ragDocument.findUnique({
      where: { id },
      select: { status: true, storageKey: true },
    });

    if (!document || document.status !== "APPROVED" || !document.storageKey) {
      return NextResponse.json(
        { ok: false, error: "No downloadable file found for this document." },
        { status: 404 },
      );
    }

    const url = await getDownloadUrl(document.storageKey);
    return NextResponse.redirect(url, { status: 307 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to generate a download link.",
      },
      { status: 500 },
    );
  }
}
