const DATABASE_URL_PLACEHOLDER = "postgresql://user:password@localhost:5432/awesome_rag_forge?schema=public";

export const DATABASE_SETUP_ERROR =
  "DATABASE_URL is not configured. Add a Postgres connection string with pgvector enabled before using the app or MCP server.";

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value || value === DATABASE_URL_PLACEHOLDER) {
    return null;
  }

  return value;
}

export function isDatabaseConfigured() {
  return getDatabaseUrl() !== null;
}

export function getRequiredDatabaseUrl() {
  const value = getDatabaseUrl();

  if (!value) {
    throw new Error(DATABASE_SETUP_ERROR);
  }

  return value;
}
