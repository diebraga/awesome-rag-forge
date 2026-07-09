import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/rag/chat-context";
import { OLLAMA_MODEL, OLLAMA_URL } from "@/lib/ollama";

type ChatRequest = {
  messages?: Array<{
    role: "bot" | "user";
    text: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = body.messages ?? [];
    const { name, systemPrompt } = await buildAssistantContext();

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
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `The model backend returned an error (${response.status}). Check that it is running and configured correctly.`,
        },
        { status: 502 }
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
        { status: 502 }
      );
    }

    return NextResponse.json({ reply, model: name });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the local model.",
      },
      { status: 500 }
    );
  }
}
