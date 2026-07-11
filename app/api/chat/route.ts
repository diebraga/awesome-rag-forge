import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { buildAssistantContext } from "@/lib/rag/chat-context";
import { getChatProvider, type ProviderChatMessage } from "@/lib/chat-providers";

type ChatRequest = {
  messages?: Array<{
    role: "bot" | "user";
    text: string;
  }>;
  model?: string;
  provider?: string;
};

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Generate a chat reply grounded in approved knowledge
 *     description: Read-only. Builds the assistant's system prompt (identity, harness rules, retrieved context) and forwards the conversation to the active ChatProvider (Ollama by default). Never writes to the database.
 *     tags: [Chat]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [bot, user] }
 *                     text: { type: string }
 *               provider:
 *                 type: string
 *                 enum: [ollama, openai, anthropic, gemini]
 *                 description: Optional provider id. Defaults to CHAT_PROVIDER, then Ollama.
 *               model:
 *                 type: string
 *                 description: Must be one of the selected provider's known models; unrecognized values fall back to the default.
 *     responses:
 *       200:
 *         description: Reply generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply: { type: string }
 *                 model: { type: string, description: "The assistant's configured display name, never the underlying model/provider." }
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       documentId: { type: string }
 *                       title: { type: string }
 *                       downloadable: { type: boolean }
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       502:
 *         description: Model backend returned an error
 *       503:
 *         description: Database unreachable, or model backend unreachable
 */
export async function POST(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected JSON." }, { status: 400 });
  }

  try {
    const messages = body.messages ?? [];
    const provider = getChatProvider(body.provider);
    // Never trust a client-supplied model name directly — only ever use one
    // from the active provider's own allowlist (see lib/chat-providers).
    const model = body.model && provider.isKnownModel(body.model) ? body.model : provider.defaultModel;
    const { name, systemPrompt, citations } = await buildAssistantContext();

    const providerMessages: ProviderChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({
        role: message.role === "bot" ? ("assistant" as const) : ("user" as const),
        content: message.text,
      })),
    ];

    const result = await provider.chat(providerMessages, model);
    if (!result.ok) {
      // Provider-supplied errors are already situation-specific and safe to
      // show (see lib/chat-providers/ollama.ts) — not a generic catch case.
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ reply: result.reply, model: name, sources: citations });
  } catch (error) {
    return routeErrorResponse("POST /api/chat", error, "Unable to reach the model backend.");
  }
}
