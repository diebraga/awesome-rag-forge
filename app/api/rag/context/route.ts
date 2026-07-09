import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/rag/context";

/**
 * Read-only integration point for external agents. Returns the same
 * identity + read-only rules + knowledge-base scope + retrieved context
 * bundle that the local chat route uses, so any agent connected to this
 * database inherits identical behavior without re-implementing it.
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
