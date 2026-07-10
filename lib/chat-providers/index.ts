import { ollamaProvider } from "./ollama";
import type { ChatProvider } from "./types";

export type { ChatProvider, ProviderChatMessage, ProviderChatResult } from "./types";

const PROVIDERS: Record<string, ChatProvider> = {
  ollama: ollamaProvider,
};

const DEFAULT_PROVIDER_ID = "ollama";

// CHAT_PROVIDER selects which backend answers the chat. Defaults to Ollama
// (local, no API key needed). Adding a second provider means implementing
// ChatProvider (see ./types.ts) and registering it here — never touching
// app/api/chat/route.ts, which only ever talks to this interface.
export function getChatProvider(): ChatProvider {
  const id = process.env.CHAT_PROVIDER || DEFAULT_PROVIDER_ID;
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown CHAT_PROVIDER "${id}". Available: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return provider;
}
