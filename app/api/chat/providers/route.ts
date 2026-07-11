import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { getProviderCatalog, getProviderSetupPrompt, isProviderId } from "@/lib/chat-providers/catalog";

/**
 * @swagger
 * /api/chat/providers:
 *   get:
 *     summary: List available testing chat providers
 *     description: Read-only provider catalog for the testing UI. Reports whether each hosted provider is configured from server-side env vars; never returns API keys.
 *     tags: [Chat]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Provider catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 providers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, enum: [ollama, openai, anthropic, gemini] }
 *                       label: { type: string }
 *                       shortLabel: { type: string }
 *                       description: { type: string }
 *                       configured: { type: boolean }
 *                       defaultModel: { type: string }
 *                       models: { type: array, items: { type: string } }
 *                       envVar: { type: string }
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       503:
 *         description: Database unreachable
 *   post:
 *     summary: Get a copyable hosted-provider setup prompt
 *     description: Returns setup instructions for the selected provider. Never accepts or stores provider API keys; keys belong in .env.
 *     tags: [Chat]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider]
 *             properties:
 *               provider: { type: string, enum: [openai, anthropic, gemini] }
 *     responses:
 *       200:
 *         description: Setup prompt returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 prompt: { type: string }
 *       400:
 *         description: Unknown provider or invalid body
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       503:
 *         description: Database unreachable
 */
export async function GET(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);
  if (readinessFailure) return readinessFailure;

  return NextResponse.json({ ok: true, providers: getProviderCatalog() });
}

export async function POST(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);
  if (readinessFailure) return readinessFailure;

  let provider: string | undefined;
  try {
    ({ provider } = (await request.json()) as { provider?: string });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body — expected JSON." }, { status: 400 });
  }

  if (!provider || !isProviderId(provider)) {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, prompt: getProviderSetupPrompt(provider) });
}
