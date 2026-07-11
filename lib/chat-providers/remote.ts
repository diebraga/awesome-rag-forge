import { getProviderDefinition, isProviderConfigured, type ProviderId } from "./catalog";
import type { ChatProvider, ProviderChatMessage, ProviderChatResult } from "./types";

function missingKey(providerId: ProviderId): ProviderChatResult {
  const provider = getProviderDefinition(providerId);
  return {
    ok: false,
    status: 503,
    error: `${provider.label} is not configured. Add ${provider.envVar} to .env, restart the dev server, and reload the page.`,
  };
}

function splitSystem(messages: ProviderChatMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const chat = messages.filter((message) => message.role !== "system");
  return { system, chat };
}

function outputText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text.trim();
  if (typeof record.text === "string") return record.text.trim();
  const output = record.output;
  if (Array.isArray(output)) {
    const text = output.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (typeof part !== "object" || part === null) return [];
        const textPart = (part as { text?: unknown }).text;
        return typeof textPart === "string" ? [textPart] : [];
      });
    }).join("\n").trim();
    return text || null;
  }
  return null;
}

function createOpenAiProvider(): ChatProvider {
  const definition = getProviderDefinition("openai");
  return {
    id: definition.id,
    defaultModel: definition.defaultModel,
    availableModels: definition.models,
    isKnownModel: (model) => definition.models.includes(model),
    async chat(messages, model) {
      if (!isProviderConfigured("openai")) return missingKey("openai");
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            input: messages.map((message) => ({
              role: message.role === "system" ? "developer" : message.role,
              content: message.content,
            })),
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, status: 502, error: `OpenAI returned an error (${response.status}). Check the API key and selected model.` };
        const reply = outputText(data);
        return reply ? { ok: true, reply } : { ok: false, status: 502, error: "OpenAI returned an empty response." };
      } catch {
        return { ok: false, status: 503, error: "Cannot reach OpenAI right now. Check your network and API key." };
      }
    },
  };
}

function createAnthropicProvider(): ChatProvider {
  const definition = getProviderDefinition("anthropic");
  return {
    id: definition.id,
    defaultModel: definition.defaultModel,
    availableModels: definition.models,
    isKnownModel: (model) => definition.models.includes(model),
    async chat(messages, model) {
      if (!isProviderConfigured("anthropic")) return missingKey("anthropic");
      const { system, chat } = splitSystem(messages);
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            system,
            max_tokens: 1200,
            temperature: 0.2,
            messages: chat.map((message) => ({ role: message.role, content: message.content })),
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = (await response.json().catch(() => null)) as { content?: Array<{ text?: string }> } | null;
        if (!response.ok) return { ok: false, status: 502, error: `Claude returned an error (${response.status}). Check the API key and selected model.` };
        const reply = data?.content?.map((part) => part.text).filter(Boolean).join("\n").trim();
        return reply ? { ok: true, reply } : { ok: false, status: 502, error: "Claude returned an empty response." };
      } catch {
        return { ok: false, status: 503, error: "Cannot reach Claude right now. Check your network and API key." };
      }
    },
  };
}

function createGeminiProvider(): ChatProvider {
  const definition = getProviderDefinition("gemini");
  return {
    id: definition.id,
    defaultModel: definition.defaultModel,
    availableModels: definition.models,
    isKnownModel: (model) => definition.models.includes(model),
    async chat(messages, model) {
      if (!isProviderConfigured("gemini")) return missingKey("gemini");
      const { system, chat } = splitSystem(messages);
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
          },
          body: JSON.stringify({
            model,
            system_instruction: system,
            input: chat.map((message) => `${message.role}: ${message.content}`).join("\n\n"),
            generation_config: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, status: 502, error: `Gemini returned an error (${response.status}). Check the API key and selected model.` };
        const reply = outputText(data);
        return reply ? { ok: true, reply } : { ok: false, status: 502, error: "Gemini returned an empty response." };
      } catch {
        return { ok: false, status: 503, error: "Cannot reach Gemini right now. Check your network and API key." };
      }
    },
  };
}

export const openAiProvider = createOpenAiProvider();
export const anthropicProvider = createAnthropicProvider();
export const geminiProvider = createGeminiProvider();
