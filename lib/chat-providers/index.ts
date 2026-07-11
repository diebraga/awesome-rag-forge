import { ollamaProvider } from "./ollama";
import { anthropicProvider, geminiProvider, openAiProvider } from "./remote";
import { isProviderId, type ProviderId } from "./catalog";
import type { ChatProvider } from "./types";

export type { ChatProvider, ProviderChatMessage, ProviderChatResult } from "./types";
export type { ProviderCatalogItem, ProviderId } from "./catalog";
export { getProviderCatalog, getProviderSetupPrompt, isProviderConfigured } from "./catalog";

const PROVIDERS: Record<ProviderId, ChatProvider> = {
  ollama: ollamaProvider,
  openai: openAiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

const DEFAULT_PROVIDER_ID: ProviderId = "ollama";

// CHAT_PROVIDER is only the server-side default. The testing UI may pass a
// provider id per request after the user chooses one locally.
export function getChatProvider(providerId?: string): ChatProvider {
  const configuredId = providerId || process.env.CHAT_PROVIDER || DEFAULT_PROVIDER_ID;
  if (!isProviderId(configuredId)) {
    throw new Error(`Unknown CHAT_PROVIDER "${configuredId}". Available: ${Object.keys(PROVIDERS).join(", ")}.`);
  }
  return PROVIDERS[configuredId];
}
