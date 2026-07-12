export type ProviderId = "ollama" | "openai" | "anthropic" | "gemini";

export type ProviderCatalogItem = {
  id: ProviderId;
  label: string;
  shortLabel: string;
  description: string;
  envVar?: string;
  configured: boolean;
  defaultModel: string;
  models: string[];
};

type ProviderDefinition = Omit<ProviderCatalogItem, "configured"> & {
  setupUrl?: string;
};

const DEFINITIONS: ProviderDefinition[] = [
  {
    id: "ollama",
    label: "Ollama",
    shortLabel: "Ollama",
    description: "Local model runtime. Best default for offline testing.",
    defaultModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    models: Array.from(new Set([process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct", "llama3.1:8b", "mistral:7b-instruct", "gemma2:9b", "phi3.5"])),
  },
  {
    id: "openai",
    label: "Codex / OpenAI",
    shortLabel: "Codex",
    description: "OpenAI-hosted models for quick cloud testing.",
    envVar: "OPENAI_API_KEY",
    defaultModel: process.env.OPENAI_MODEL ?? "gpt-5.2-mini",
    models: Array.from(new Set([process.env.OPENAI_MODEL ?? "gpt-5.2-mini", "gpt-5.2", "gpt-5.1"])),
    setupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Claude",
    shortLabel: "Claude",
    description: "Anthropic Claude models for hosted chat testing.",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    models: Array.from(new Set([process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"])),
    setupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    label: "Gemini",
    shortLabel: "Gemini",
    description: "Google Gemini models for hosted chat testing.",
    envVar: "GEMINI_API_KEY",
    defaultModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    models: Array.from(new Set([process.env.GEMINI_MODEL ?? "gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash"])),
    setupUrl: "https://aistudio.google.com/app/apikey",
  },
];

export function isProviderId(value: string): value is ProviderId {
  return DEFINITIONS.some((provider) => provider.id === value);
}

export function isProviderConfigured(id: ProviderId): boolean {
  const provider = DEFINITIONS.find((item) => item.id === id);
  if (!provider) return false;
  if (!provider.envVar) return true;
  return Boolean(process.env[provider.envVar]?.trim());
}

export function getProviderDefinition(id: ProviderId): ProviderDefinition {
  const provider = DEFINITIONS.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export function getProviderCatalog(): ProviderCatalogItem[] {
  return DEFINITIONS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    shortLabel: provider.shortLabel,
    description: provider.description,
    envVar: provider.envVar,
    configured: isProviderConfigured(provider.id),
    defaultModel: provider.defaultModel,
    models: provider.models,
  }));
}

export function getProviderSetupPrompt(id: ProviderId): string {
  const provider = getProviderDefinition(id);
  if (!provider.envVar) {
    return "Use the Ollama button in the local UI. It can install/start Ollama locally where supported, then download the selected model.";
  }

  return `Set up ${provider.label} for awesome-rag-forge.\n\n1. Open ${provider.setupUrl}.\n2. Create or copy an API key.\n3. Ask your AI assistant to open the local key-setup terminal for you, or run \`npm run setup:provider -- ${provider.id}\` yourself — it asks for the key with masked input and writes it straight to .env as ${provider.envVar}. Never paste the key into a chat.\n4. Keep the key out of git, logs, screenshots, and browser storage.\n5. If it does not reload automatically, restart the Next.js dev server.\n6. Reload the browser; if ${provider.label} is selected and configured, continue directly to the chat.\n\nUse ${provider.defaultModel} by default. Other lightweight test models: ${provider.models.join(", ")}.`;
}
