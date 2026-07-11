import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { listApprovedCollections } from "@/lib/rag/collections";

/**
 * Read-only, APPROVED-only list of collections for the Collections page.
 * Same visibility as the chat — see lib/rag/collections.ts.
 */
/**
 * @swagger
 * /api/rag/collections:
 *   get:
 *     summary: List approved collections
 *     tags: [Collections]
 *     security: [{ bearerAuth: [] }]
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
    const collections = await listApprovedCollections();
    return NextResponse.json({ ok: true, collections });
  } catch (error) {
    return routeErrorResponse("GET /api/rag/collections", error, "Unable to load collections.");
  }
}
