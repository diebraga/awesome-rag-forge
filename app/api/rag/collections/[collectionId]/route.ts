import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { getCollectionDetail } from "@/lib/rag/collections";

/**
 * Read-only, APPROVED, EXTERNAL, CHAT-visible paginated detail for one collection — backs
 * the collection detail page. Same visibility as the chat — see
 * lib/rag/collections.ts.
 */
/**
 * @swagger
 * /api/rag/collections/{collectionId}:
 *   get:
 *     summary: Paginated detail for one approved collection
 *     tags: [Collections]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: collectionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Collection detail retrieved
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled, or collection not found
 *       503:
 *         description: Database unreachable
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
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
    return routeErrorResponse("GET /api/rag/collections/[collectionId]", error, "Unable to load collection detail.");
  }
}
