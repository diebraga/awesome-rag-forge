#!/usr/bin/env node
// Run with: npm run setup:provider -- <openai|anthropic|gemini>
//
// Asks for exactly one hosted provider's API key, masked, and writes it
// straight into .env. Triggered when the user picks a provider in the chat
// UI's provider chooser — an AI assistant should open this flow instead of
// ever asking the user to paste the key into the chat. See
// docs/security.md#local-secret-onboarding and getProviderSetupPrompt in
// lib/chat-providers/catalog.ts.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { askMasked } from "./masked-prompt";
import { upsertEnvVar } from "./env-file";
import { getProviderDefinition, isProviderId } from "../lib/chat-providers/catalog";

async function main() {
  const id = process.argv[2];

  if (!id || !isProviderId(id)) {
    console.log('Usage: npm run setup:provider -- <openai|anthropic|gemini>');
    process.exit(1);
  }

  const provider = getProviderDefinition(id);
  if (!provider.envVar) {
    console.log(`${provider.label} needs no API key — use the Ollama button in the local UI instead.`);
    return;
  }

  console.log(`${provider.label} setup — the key is masked and never leaves this terminal.\n`);
  if (provider.setupUrl) console.log(`Get a key at: ${provider.setupUrl}\n`);

  const value = await askMasked(`${provider.envVar}: `);
  if (!value) {
    console.log("No key entered — nothing saved.");
    return;
  }

  const envPath = join(process.cwd(), ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  writeFileSync(envPath, upsertEnvVar(current, provider.envVar, value));

  console.log(`\nSaved ${provider.envVar}. Restart the dev server, then reload the browser.`);
}

main();
