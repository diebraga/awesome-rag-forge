import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/rag/chat-context";
import { getChatProvider, type ProviderChatMessage } from "@/lib/chat-providers";

type ChatRequest = {
  messages?: Array<{
    role: "bot" | "user";
    text: string;
  }>;
  model?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = body.messages ?? [];
    const provider = getChatProvider();
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
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ reply: result.reply, model: name, sources: citations });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reach the model backend.",
      },
      { status: 500 },
    );
  }
}
