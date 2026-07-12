#!/usr/bin/env node
// Run with: npm run setup
//
// Database + storage setup only — for hosted LLM provider keys (OpenAI,
// Anthropic, Gemini), use `npm run setup:provider -- <id>` instead, triggered
// when the user picks a provider in the chat UI. See scripts/setup-provider.ts.
//
// Asks for secrets one at a time, with masked input, and writes each one
// straight into .env as soon as you answer it. This exists so real secrets
// never have to be pasted into an AI assistant's chat —
// see docs/security.md#local-secret-onboarding.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { askMasked } from "./masked-prompt";
import { upsertEnvVar } from "./env-file";

type Field = { key: string; prompt: string; required: boolean };

const FIELDS: Field[] = [
  { key: "DATABASE_URL", prompt: "Postgres DATABASE_URL (with pgvector)", required: true },
  { key: "STORAGE_BUCKET", prompt: "Storage bucket name (blank to skip storage setup)", required: false },
  { key: "STORAGE_ACCESS_KEY_ID", prompt: "Storage access key ID (blank to skip)", required: false },
  { key: "STORAGE_SECRET_ACCESS_KEY", prompt: "Storage secret access key (blank to skip)", required: false },
  { key: "STORAGE_REGION", prompt: "Storage region, e.g. auto or us-east-1 (blank to skip)", required: false },
  { key: "STORAGE_ENDPOINT", prompt: "Storage endpoint, e.g. R2 URL (blank to skip)", required: false },
];

async function main() {
  const envPath = join(process.cwd(), ".env");
  console.log("awesome-rag-forge database/storage setup — values are masked and never leave this terminal.\n");

  for (const field of FIELDS) {
    const label = `${field.prompt}: `;
    const value = await askMasked(label);

    if (!value) {
      if (field.required) {
        console.log(`  ${field.key} is required — run "npm run setup" again when you have it.`);
        process.exit(1);
      }
      continue;
    }

    const current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    writeFileSync(envPath, upsertEnvVar(current, field.key, value));
    console.log(`  saved ${field.key}`);
  }

  console.log("\nDone. Run \"npm run check:env\" (or ask your AI assistant to) to verify connections.");
}

main();
