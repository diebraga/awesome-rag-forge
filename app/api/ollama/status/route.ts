import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { getOllamaStatus } from "@/lib/ollama";

/**
 * @swagger
 * /api/ollama/status:
 *   get:
 *     summary: Check whether Ollama is running and which models are installed
 *     tags: [Ollama]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 running: { type: boolean }
 *                 installedModels: { type: array, items: { type: string } }
 *                 availableModels: { type: array, items: { type: string } }
 *                 canAutoStart: { type: boolean }
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
    const status = await getOllamaStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    return routeErrorResponse("GET /api/ollama/status", error, "Unable to check the model backend's status.");
  }
}
