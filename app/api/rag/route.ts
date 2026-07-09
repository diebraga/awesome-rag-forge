import { NextResponse } from "next/server";
import { getRagContext } from "@/lib/rag/retrieval";

export async function GET() {
  try {
    const context = await getRagContext();
    return NextResponse.json({
      ok: true,
      count: context.length,
      context,
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
