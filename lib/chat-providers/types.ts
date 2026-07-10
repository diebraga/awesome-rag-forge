export type ProviderChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderChatResult =
  | { ok: true; reply: string }
  | { ok: false; status: number; error: string };

/**
 * A swappable backend for the chat's replies. app/api/chat/route.ts talks
 * only to this interface, never to a specific provider's API directly, so
 * adding a second provider (Claude API, OpenAI, ...) never means touching
 * the route — just registering it in lib/chat-providers/index.ts and
 * setting CHAT_PROVIDER. Ollama stays the default; see OllamaProvider.
 */
export interface ChatProvider {
  readonly id: string;
  readonly defaultModel: string;
  readonly availableModels: string[];
  isKnownModel(model: string): boolean;
  chat(messages: ProviderChatMessage[], model: string): Promise<ProviderChatResult>;
}
