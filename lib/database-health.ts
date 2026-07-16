import { prisma } from "@/lib/prisma";
import { DATABASE_SETUP_ERROR, getDatabaseUrl, isDatabaseConfigured } from "@/lib/database-config";
import { isDevDisconnectSimulated } from "@/lib/dev-disconnect";

export const DATABASE_CONNECTION_ERROR =
  "Unable to connect to the configured database. Check DATABASE_URL, network access, credentials, SSL settings, and whether the Postgres server is running.";

export const DATABASE_SIMULATED_DISCONNECT_ERROR =
  "Simulated disconnect is on. Use the Disconnect button in the header to turn it off.";

export type DatabaseConnectionStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "connection"; error: string };

// app/layout.tsx is force-dynamic (needed so the Disconnect button and the
// connection gate react without a server restart), which means this check
// used to re-run a real network round-trip to Postgres on every single
// navigation -- brutal when DATABASE_URL is a remote host, not localhost.
// A short TTL cache (globalThis-scoped, same pattern as lib/prisma.ts) keeps
// navigation snappy while staying fresh enough to catch a real disconnect
// within a few seconds. Keyed on the URL so a live reconnect to a different
// DATABASE_URL is never served a stale result.
const CHECK_TTL_MS = 5000;

const globalForDatabaseHealth = globalThis as unknown as {
  databaseHealthCache?: { url: string; status: DatabaseConnectionStatus; checkedAt: number };
};

export async function getDatabaseConnectionStatus(): Promise<DatabaseConnectionStatus> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "missing", error: DATABASE_SETUP_ERROR };
  }

  if (isDevDisconnectSimulated()) {
    return { ok: false, reason: "connection", error: DATABASE_SIMULATED_DISCONNECT_ERROR };
  }

  const url = getDatabaseUrl() ?? "";
  const cached = globalForDatabaseHealth.databaseHealthCache;
  if (cached && cached.url === url && Date.now() - cached.checkedAt < CHECK_TTL_MS) {
    return cached.status;
  }

  let status: DatabaseConnectionStatus;
  try {
    await prisma.$queryRaw`SELECT 1`;
    status = { ok: true };
  } catch {
    status = { ok: false, reason: "connection", error: DATABASE_CONNECTION_ERROR };
  }

  globalForDatabaseHealth.databaseHealthCache = { url, status, checkedAt: Date.now() };
  return status;
}
