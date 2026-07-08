import { NextResponse } from "next/server";
import { getRagContext } from "@/lib/rag";

type ChatRequest = {
  messages?: Array<{
    role: "bot" | "user";
    text: string;
  }>;
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

const systemPrompt = `You are Legal Bot, a careful legal information assistant running locally.

Rules:
- Give general legal information and practical issue-spotting, not final legal advice.
- Ask for jurisdiction when it matters and is missing.
- Be concise, plain-spoken, and specific.
- Never invent statutes, cases, citations, or facts.
- Say when a licensed lawyer should review the issue.
- If the question involves immediate deadlines, litigation, criminal exposure, immigration status, or high financial risk, recommend speaking with a lawyer.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = body.messages ?? [];
    const ragContext = await getRagContext();
    const ragPrompt =
      ragContext.length > 0
        ? `\n\nApproved RAG context from the database:\n\n${ragContext.join(
            "\n\n---\n\n",
          )}\n\nUse this context when relevant and cite the source labels.`
        : "";

    const ollamaMessages = [
      { role: "system", content: `${systemPrompt}${ragPrompt}` },
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
          error: `Ollama returned ${response.status}. Make sure ${OLLAMA_MODEL} is downloaded and Ollama is running.`,
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
        { error: "Ollama returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply, model: OLLAMA_MODEL });
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
