import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { logRouteError } from "@/lib/api-errors";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { canAutoStartOllama, startOllamaLocally } from "@/lib/ollama";

/**
 * Attempts to launch Ollama on the machine running this server process.
 * Only ever does anything for a local OLLAMA_URL outside production — see
 * lib/ollama.ts canAutoStartOllama(). This never targets any machine other
 * than the one this Next.js server is already running on.
 *
 * @swagger
 * /api/ollama/start:
 *   post:
 *     summary: Attempt to launch Ollama on this machine
 *     description: Local-only, non-production — never targets any machine other than the one this server process is already running on.
 *     tags: [Ollama]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ollama started (or was already running)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { ok: { type: boolean } }
 *       400:
 *         description: Auto-start not available in this environment
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       404:
 *         description: Testing surface disabled
 *       500:
 *         description: Ollama is not installed, or failed to start
 *       503:
 *         description: Database unreachable
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
  }

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
    // startOllamaLocally() only ever throws its own crafted, user-safe
    // message (see lib/ollama.ts) — unlike a Prisma/S3/fetch error, it's
    // safe to show directly. Still log it the same way for consistency.
    logRouteError("POST /api/ollama/start", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to start Ollama." },
      { status: 500 },
    );
  }
}
