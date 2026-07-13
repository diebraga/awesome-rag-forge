import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { listApprovedCollections } from "@/lib/rag/collections";

/**
 * Read-only list of APPROVED, EXTERNAL, CHAT-visible collections for the Collections page.
 * Same visibility as the chat — see lib/rag/collections.ts.
 */
/**
 * @swagger
 * /api/rag/collections:
 *   get:
 *     summary: List approved collections
 *     tags: [Collections]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: Collections retrieved
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       503:
 *         description: Database unreachable
 */
export async function GET(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1") || 1;
    const pageSize = Number(searchParams.get("pageSize") ?? "10") || 10;
    const result = await listApprovedCollections(page, pageSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeErrorResponse("GET /api/rag/collections", error, "Unable to load collections.");
  }
}
