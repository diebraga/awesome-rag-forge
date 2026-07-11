import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { getRagContext } from "@/lib/rag/retrieval";

/**
 * @swagger
 * /api/rag:
 *   get:
 *     summary: Debug/inspection endpoint for raw retrieval output
 *     description: Returns the same prompt blocks and citations the chat route retrieves, without generating a reply — useful for verifying retrieval independent of the LLM.
 *     tags: [Chat]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Retrieved context returned
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
    const { promptBlocks, citations } = await getRagContext();
    return NextResponse.json({
      ok: true,
      count: promptBlocks.length,
      context: promptBlocks,
      citations,
    });
  } catch (error) {
    return routeErrorResponse("GET /api/rag", error, "Unable to read RAG context.");
  }
}
