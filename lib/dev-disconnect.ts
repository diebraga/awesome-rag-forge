/**
 * In-memory only, resets on server restart. Lets a local developer preview
 * the DatabaseSetupRequired/DatabaseConnectionFailed screens on demand
 * (from the /review dashboard) without editing DATABASE_URL and restarting
 * the server. Never persisted to disk, never touches the real connection --
 * getDatabaseConnectionStatus() just short-circuits to the "connection"
 * failure branch while this is true, same shape as a genuine outage.
 *
 * Stored on globalThis, not a plain module-level `let`, for the same reason
 * lib/prisma.ts does: Next.js can give the page-render path and the API
 * route path separate module instances (per-route bundling in dev/HMR), so
 * a plain `let` set by the toggle route would not be visible to the page
 * that reads it a moment later.
 */
const globalForDevDisconnect = globalThis as unknown as {
  ragForgeDevDisconnect?: boolean;
};

export function isDevDisconnectSimulated() {
  return globalForDevDisconnect.ragForgeDevDisconnect ?? false;
}

export function setDevDisconnectSimulated(value: boolean) {
  globalForDevDisconnect.ragForgeDevDisconnect = value;
}

/**
 * Whether the simulate-disconnect toggle is allowed to be flipped at all.
 * Mirrors canAutoStartOllama()/canOpenSetupTerminal(): never in production
 * (this route never ships to Vercel anyway -- see docs/deployment.md -- but
 * this is defense in depth for any other deploy target).
 */
export function canSimulateDisconnect({
  isProduction = process.env.NODE_ENV === "production",
}: { isProduction?: boolean } = {}) {
  return !isProduction;
}
