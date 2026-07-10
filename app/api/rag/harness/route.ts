import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { prisma } from "@/lib/prisma";
import { getAssistantConfig } from "@/lib/rag/chat-context";
import { getApprovedHarnessRules } from "@/lib/rag/harness";

/**
 * Read-only: the chat's identity and its APPROVED capabilities/restrictions,
 * without the retrieval call that GET /api/rag/context also does. Backs the
 * Harness page (app/harness/). Same visibility as the chat — see
 * lib/rag/harness.ts and lib/rag/chat-context.ts.
 */
export async function GET() {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  try {
    const [{ name, instructions }, { capabilities, restrictions }] = await Promise.all([
      getAssistantConfig(),
      getApprovedHarnessRules(prisma),
    ]);

    return NextResponse.json({ ok: true, name, instructions, capabilities, restrictions });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load harness configuration.",
      },
      { status: 500 },
    );
  }
}
