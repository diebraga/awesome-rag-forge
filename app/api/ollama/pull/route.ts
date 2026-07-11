import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { logRouteError } from "@/lib/api-errors";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { canAutoStartOllama, isKnownModel, OLLAMA_URL } from "@/lib/ollama";

/**
 * Streams Ollama's own pull progress straight through to the client so the
 * UI can show real download progress instead of a blind spinner for what
 * can be a multi-gigabyte download.
 *
 * Gated the same way as /api/ollama/start (local-only, non-production) —
 * pulling a model is a resource-consuming action (bandwidth, disk) that a
 * deployed instance must never let a visitor's browser request trigger.
 * The requested model must also be one of the fixed AVAILABLE_MODELS —
 * never pass an arbitrary client-supplied model name to Ollama.
 *
 * @swagger
 * /api/ollama/pull:
 *   post:
 *     summary: Stream a model download's progress from Ollama
 *     description: Local-only, non-production. The requested model must be one of the fixed AVAILABLE_MODELS.
 *     tags: [Ollama]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [model]
 *             properties:
 *               model: { type: string }
 *     responses:
 *       200:
 *         description: Newline-delimited JSON progress stream, passed through from Ollama unmodified
 *         content:
 *           application/x-ndjson: {}
 *       400:
 *         description: Invalid body, unknown model, or auto-start not available in this environment
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       404:
 *         description: Testing surface disabled
 *       502:
 *         description: Ollama returned an error starting the download
 *       503:
 *         description: Database unreachable, or cannot reach Ollama
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
        error: "Downloading models automatically is only available for a local OLLAMA_URL outside production.",
      },
      { status: 400 },
    );
  }

  let model: string | undefined;
  try {
    ({ model } = (await request.json()) as { model?: string });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body — expected JSON." }, { status: 400 });
  }

  if (!model || !isKnownModel(model)) {
    return NextResponse.json(
      { ok: false, error: "Unknown model. Choose one from the model dropdown." },
      { status: 400 },
    );
  }

  let ollamaResponse: Response;
  try {
    ollamaResponse = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
  } catch (error) {
    logRouteError("POST /api/ollama/pull (fetch)", error);
    return NextResponse.json(
      { ok: false, error: "Cannot reach Ollama to start the download. Make sure it's running." },
      { status: 503 },
    );
  }

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    return NextResponse.json(
      { ok: false, error: `Ollama returned an error (${ollamaResponse.status}) starting the download.` },
      { status: 502 },
    );
  }

  // Pass Ollama's newline-delimited JSON progress stream straight through.
  return new Response(ollamaResponse.body, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
