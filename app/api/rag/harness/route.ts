import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getAssistantConfig } from "@/lib/rag/chat-context";
import { getApprovedHarnessRules } from "@/lib/rag/harness";

/**
 * Read-only: the chat's identity and its APPROVED capabilities/restrictions,
 * without the retrieval call that GET /api/rag/context also does. Backs the
 * Harness page (app/harness/). Same visibility as the chat — see
 * lib/rag/harness.ts and lib/rag/chat-context.ts.
 */
/**
 * @swagger
 * /api/rag/harness:
 *   get:
 *     summary: "Testing UI: approved assistant identity and harness"
 *     description: Read-only testing-surface endpoint for showing the approved assistant identity, capabilities, and restrictions. Harness proposal and management stay outside this API; pending review is handled through MCP or the guarded local /review page.
 *     tags: [Harness]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Harness configuration retrieved
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
    const [{ name, instructions }, { capabilities, restrictions }] = await Promise.all([
      getAssistantConfig(),
      getApprovedHarnessRules(prisma),
    ]);

    return NextResponse.json({ ok: true, name, instructions, capabilities, restrictions });
  } catch (error) {
    return routeErrorResponse("GET /api/rag/harness", error, "Unable to load harness configuration.");
  }
}
