import { AVAILABLE_MODELS, OLLAMA_MODEL, OLLAMA_URL, isKnownModel } from "@/lib/ollama";
import type { ChatProvider, ProviderChatMessage, ProviderChatResult } from "./types";

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

// The default provider — status detection, auto-start, and model pull
// (lib/ollama.ts, app/api/ollama/*) are unchanged by this abstraction; this
// module only wraps the actual reply-generating call.
export const ollamaProvider: ChatProvider = {
  id: "ollama",
  defaultModel: OLLAMA_MODEL,
  availableModels: AVAILABLE_MODELS,
  isKnownModel,

  async chat(messages: ProviderChatMessage[], model: string): Promise<ProviderChatResult> {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature: 0.2, top_p: 0.9 },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const isModelMissing = response.status === 404;
        return {
          ok: false,
          status: 502,
          error: isModelMissing
            ? `"${model}" isn't downloaded yet. Go to the Chat page's model dropdown and download it first.`
            : `The model backend returned an error (${response.status}). Check that it is running and configured correctly.`,
        };
      }

      const data = (await response.json()) as { message?: { content?: string } };
      const reply = data.message?.content?.trim();
      if (!reply) {
        return { ok: false, status: 502, error: "The model backend returned an empty response." };
      }

      return { ok: true, reply };
    } catch (error) {
      if (isConnectionError(error)) {
        return {
          ok: false,
          status: 503,
          error: "Cannot reach Ollama right now. Make sure it's running, then click Connect on the Chat page and try again.",
        };
      }

      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Unable to reach the local model.",
      };
    }
  },
};
