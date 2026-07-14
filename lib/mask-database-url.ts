/**
 * Redacts credentials from a database URL for display, keeping only what's
 * needed to recognize *which* database it is: protocol, host, port,
 * database name, and query string. Never returns the username or password.
 *
 * See docs/database.md: "the UI/API must never echo the full connection
 * string or raw provider error because it may contain credentials." This
 * function is the one sanctioned way to show any part of DATABASE_URL in
 * the UI.
 */
export function maskDatabaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
