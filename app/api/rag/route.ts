import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { getRagContext } from "@/lib/rag/retrieval";

export async function GET() {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read RAG context.",
      },
      { status: 500 },
    );
  }
}
