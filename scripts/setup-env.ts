#!/usr/bin/env node
// Run with: npm run setup
//
// Asks for secrets one at a time, with masked input, and writes each one
// straight into .env as soon as you answer it. This exists so real secrets
// (DATABASE_URL, API keys, storage credentials) never have to be pasted into
// an AI assistant's chat — see docs/security.md#local-secret-onboarding.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";
import { upsertEnvVar } from "./env-file";

type Field = { key: string; prompt: string; required: boolean };

const FIELDS: Field[] = [
  { key: "DATABASE_URL", prompt: "Postgres DATABASE_URL (with pgvector)", required: true },
  { key: "OPENAI_API_KEY", prompt: "OpenAI API key (blank to skip)", required: false },
  { key: "ANTHROPIC_API_KEY", prompt: "Anthropic API key (blank to skip)", required: false },
  { key: "GEMINI_API_KEY", prompt: "Gemini API key (blank to skip)", required: false },
  { key: "APP_API_KEY", prompt: "APP_API_KEY for the testing surface (blank to skip)", required: false },
  { key: "STORAGE_BUCKET", prompt: "Storage bucket name (blank to skip storage setup)", required: false },
  { key: "STORAGE_ACCESS_KEY_ID", prompt: "Storage access key ID (blank to skip)", required: false },
  { key: "STORAGE_SECRET_ACCESS_KEY", prompt: "Storage secret access key (blank to skip)", required: false },
  { key: "STORAGE_REGION", prompt: "Storage region, e.g. auto or us-east-1 (blank to skip)", required: false },
  { key: "STORAGE_ENDPOINT", prompt: "Storage endpoint, e.g. R2 URL (blank to skip)", required: false },
];

function askMasked(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let value = "";

    const onKeypress = (char: string) => {
      const code = char.charCodeAt(0);
      if (char === "\n" || char === "\r" || code === 4) return;
      if (code === 127 || code === 8) {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
      readline.cursorTo(process.stdout, 0);
      process.stdout.clearLine(0);
      process.stdout.write(query + "*".repeat(value.length));
    };

    process.stdin.on("data", onKeypress);
    rl.question(query, () => {
      process.stdin.removeListener("data", onKeypress);
      rl.close();
      process.stdout.write("\n");
      resolve(value.trim());
    });
  });
}

async function main() {
  const envPath = join(process.cwd(), ".env");
  console.log("awesome-rag-forge local setup — values are masked and never leave this terminal.\n");

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
