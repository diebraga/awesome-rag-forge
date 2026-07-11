import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { buildAssistantContext } from "@/lib/rag/chat-context";

/**
 * Read-only integration point for external agents. Returns the same
 * identity + read-only rules + harness capabilities/restrictions +
 * knowledge-base scope + retrieved context bundle that the local chat
 * route uses, so any agent connected to this database inherits identical
 * end-user-facing behavior without re-implementing it — including never
 * narrating the knowledge base's own structure (see lib/rag/chat-context.ts).
 * This is the chat's context, not the knowledge base creator's — for that,
 * connect an MCP client to mcp/rag-manager instead (see docs/mcp-server.md).
 *
 * Uses the same testing-surface readiness and optional API-key gate as
 * the browser UI routes.
 *
 * @swagger
 * /api/rag/context:
 *   get:
 *     summary: "Advanced integration: assistant context bundle"
 *     description: Advanced read-only integration endpoint. Returns the same end-user-facing system prompt, approved harness rules, knowledge-base scope, citations, and retrieved RAG context used by /api/chat. This is not a creator/admin endpoint and never exposes drafts, rejected knowledge, feedback review queues, or MCP-only workflow state.
 *     tags: [Chat]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Context bundle retrieved
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
    const context = await buildAssistantContext();
    return NextResponse.json({ ok: true, ...context });
  } catch (error) {
    return routeErrorResponse("GET /api/rag/context", error, "Unable to build assistant context.");
  }
}
