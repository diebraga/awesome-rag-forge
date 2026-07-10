import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import { getOllamaStatus } from "@/lib/ollama";

export async function GET() {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  const status = await getOllamaStatus();
  return NextResponse.json({ ok: true, ...status });
}
