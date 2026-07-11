import { describe, expect, test } from "vitest";
import { getProviderCatalog, getProviderSetupPrompt } from "./catalog";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("provider catalog", () => {
  test("always lists Ollama first and reports API-key providers by env", () => {
    withEnv({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: "gemini-test" }, () => {
      const providers = getProviderCatalog();

      expect(providers.map((provider) => provider.id)).toEqual(["ollama", "openai", "anthropic", "gemini"]);
      expect(providers.find((provider) => provider.id === "ollama")?.configured).toBe(true);
      expect(providers.find((provider) => provider.id === "openai")?.configured).toBe(true);
      expect(providers.find((provider) => provider.id === "anthropic")?.configured).toBe(false);
      expect(providers.find((provider) => provider.id === "gemini")?.configured).toBe(true);
    });
  });

  test("setup prompts tell agents which env var to set without containing secrets", () => {
    const prompt = getProviderSetupPrompt("anthropic");

    expect(prompt).toContain("ANTHROPIC_API_KEY");
    expect(prompt).toContain(".env");
    expect(prompt).toContain("restart");
    expect(prompt).not.toContain("sk-");
  });
});
