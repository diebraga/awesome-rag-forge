import { prisma } from "@/lib/prisma";
import { DATABASE_SETUP_ERROR, isDatabaseConfigured } from "@/lib/database-config";
import { isDevDisconnectSimulated } from "@/lib/dev-disconnect";
import { maskDatabaseUrl } from "@/lib/mask-database-url";

export const DATABASE_CONNECTION_ERROR =
  "Unable to connect to the configured database. Check DATABASE_URL, network access, credentials, SSL settings, and whether the Postgres server is running.";

export const DATABASE_SIMULATED_DISCONNECT_ERROR =
  "Simulated disconnect is on (toggled from /review for local testing). Turn it off there to reconnect.";

export type DatabaseConnectionStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "connection"; error: string; maskedUrl?: string };

export async function getDatabaseConnectionStatus(): Promise<DatabaseConnectionStatus> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "missing", error: DATABASE_SETUP_ERROR };
  }

  // process.env.DATABASE_URL is known set past isDatabaseConfigured() above.
  const maskedUrl = maskDatabaseUrl(process.env.DATABASE_URL!) ?? undefined;

  if (isDevDisconnectSimulated()) {
    return { ok: false, reason: "connection", error: DATABASE_SIMULATED_DISCONNECT_ERROR, maskedUrl };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, reason: "connection", error: DATABASE_CONNECTION_ERROR, maskedUrl };
  }
}
