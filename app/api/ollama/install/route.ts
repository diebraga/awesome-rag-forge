import { NextResponse } from "next/server";
import { logRouteError } from "@/lib/api-errors";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { canAutoStartOllama, installOllamaLocally } from "@/lib/ollama";

/**
 * @swagger
 * /api/ollama/install:
 *   post:
 *     summary: Attempt to install Ollama on this machine
 *     description: Local-only, non-production helper. Uses a supported local package manager when available and never targets a remote machine.
 *     tags: [Ollama]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ollama installed or already available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { ok: { type: boolean } }
 *       400:
 *         description: Auto-install not available in this environment
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       500:
 *         description: Installation failed or manual installation required
 *       503:
 *         description: Database unreachable
 */
export async function POST(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);
  if (readinessFailure) return readinessFailure;

  if (!canAutoStartOllama()) {
    return NextResponse.json(
      { ok: false, error: "Installing Ollama automatically is only available locally outside production." },
      { status: 400 },
    );
  }

  try {
    await installOllamaLocally();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("POST /api/ollama/install", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to install Ollama." },
      { status: 500 },
    );
  }
}
