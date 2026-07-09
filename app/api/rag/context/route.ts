import { NextResponse } from "next/server";
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
 * No authentication is applied yet — this is intended for local/MVP use.
 * Add an API key or similar before exposing this beyond your own machine.
 */
export async function GET() {
  try {
    const context = await buildAssistantContext();
    return NextResponse.json({ ok: true, ...context });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to build assistant context.",
      },
      { status: 500 },
    );
  }
}
