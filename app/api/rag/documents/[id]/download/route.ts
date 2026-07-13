import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/storage";

/**
 * Read-only APPROVED, EXTERNAL, CHAT-visible document download. Redirects to a short-lived
 * presigned URL rather than proxying bytes — the bucket stays private, and
 * this route never reads DRAFT/PENDING_REVIEW/REJECTED documents' files,
 * matching every other route's approved external chat-visible rule.
 */
/**
 * @swagger
 * /api/rag/documents/{id}/download:
 *   get:
 *     summary: Download an approved document's stored original file
 *     description: Requires the document to be status APPROVED, audience EXTERNAL, visibility CHAT, inside an external chat-visible collection, with a non-null storageKey. Redirects to a short-lived presigned URL by default, or returns it as JSON with ?format=json.
 *     tags: [Documents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json] }
 *         description: Pass "json" to receive { ok, url } instead of a 307 redirect.
 *     responses:
 *       200:
 *         description: "Presigned URL returned as JSON (only with ?format=json)"
 *       307:
 *         description: Redirect to a short-lived presigned download URL
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled, or no downloadable file for this document
 *       503:
 *         description: Database unreachable
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
  }

  try {
    const { id } = await params;
    const document = await prisma.ragDocument.findFirst({
      where: {
        id,
        status: "APPROVED",
        audience: "EXTERNAL",
        visibility: { has: "CHAT" },
        collection: { audience: "EXTERNAL", visibility: { has: "CHAT" } },
      },
      select: { storageKey: true },
    });

    if (!document || !document.storageKey) {
      return NextResponse.json(
        { ok: false, error: "No downloadable file found for this document." },
        { status: 404 },
      );
    }

    const url = await getDownloadUrl(document.storageKey);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "json") {
      return NextResponse.json({ ok: true, url });
    }

    return NextResponse.redirect(url, { status: 307 });
  } catch (error) {
    // A raw S3/storage error here could include bucket/endpoint details —
    // never echo it directly, unlike the "not found" case above.
    return routeErrorResponse("GET /api/rag/documents/[id]/download", error, "Unable to generate a download link.");
  }
}
