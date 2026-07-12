#!/usr/bin/env node
// Run with: npm run check:env
//
// Reports connected/failed only — never prints DATABASE_URL, API keys, or
// storage credentials. Safe for an AI assistant to run and read the output
// of, since it never has to open .env itself. See docs/security.md.
import "dotenv/config";
import { getDatabaseConnectionStatus } from "../lib/database-health";
import { getStorageConnectionStatus, isStorageConfigured } from "../lib/storage";

async function main() {
  const db = await getDatabaseConnectionStatus();
  console.log(`Database: ${db.ok ? "connected" : `failed (${db.reason})`}`);
  if (!db.ok) console.log(`  ${db.error}`);

  if (!isStorageConfigured()) {
    console.log("Storage: not configured (optional — only needed to store original uploaded files)");
  } else {
    const storage = await getStorageConnectionStatus();
    console.log(`Storage: ${storage.ok ? "connected" : `failed (${storage.reason})`}`);
    if (!storage.ok) console.log(`  ${storage.error}`);
  }

  process.exit(db.ok ? 0 : 1);
}

main();
