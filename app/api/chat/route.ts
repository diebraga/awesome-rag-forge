import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/rag/chat-context";
import { isKnownModel, OLLAMA_MODEL, OLLAMA_URL } from "@/lib/ollama";

type ChatRequest = {
  messages?: Array<{
    role: "bot" | "user";
    text: string;
  }>;
  model?: string;
};

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).cause
    ? ((error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException)?.code
    : (error as NodeJS.ErrnoException).code;
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    error.name === "AbortError" ||
    /fetch failed/i.test(error.message)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = body.messages ?? [];
    // Never trust a client-supplied model name directly — only ever use one
    // from the fixed AVAILABLE_MODELS allowlist (see lib/ollama.ts).
    const model = body.model && isKnownModel(body.model) ? body.model : OLLAMA_MODEL;
    const { name, systemPrompt, citations } = await buildAssistantContext();

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({
        role: message.role === "bot" ? "assistant" : "user",
        content: message.text,
      })),
    ];

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const isModelMissing = response.status === 404;
      return NextResponse.json(
        {
          error: isModelMissing
            ? `"${model}" isn't downloaded yet. Go to the Chat page's model dropdown and download it first.`
            : `The model backend returned an error (${response.status}). Check that it is running and configured correctly.`,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const reply = data.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "The model backend returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply, model: name, sources: citations });
  } catch (error) {
    if (isConnectionError(error)) {
      return NextResponse.json(
        {
          error:
            "Cannot reach Ollama right now. Make sure it's running, then click Connect on the Chat page and try again.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reach the local model.",
      },
      { status: 500 },
    );
  }
}
