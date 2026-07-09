import { NextResponse } from "next/server";
import { canAutoStartOllama, startOllamaLocally } from "@/lib/ollama";

/**
 * Attempts to launch Ollama on the machine running this server process.
 * Only ever does anything for a local OLLAMA_URL outside production — see
 * lib/ollama.ts canAutoStartOllama(). This never targets any machine other
 * than the one this Next.js server is already running on.
 */
export async function POST() {
  if (!canAutoStartOllama()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Starting Ollama automatically is only available for a local OLLAMA_URL outside production.",
      },
      { status: 400 },
    );
  }

  try {
    await startOllamaLocally();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to start Ollama.",
      },
      { status: 500 },
    );
  }
}
