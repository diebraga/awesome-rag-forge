# Integrating With An Existing App

Awesome RAG Forge can sit beside another application's database tables as a portable knowledge layer. The host app owns users and permissions; the brain owns knowledge organization and retrieval.

## Recommended shape

Use the same Postgres database or another Postgres database in the same environment. Apply the Awesome RAG Forge Prisma schema with `npx prisma db push`, then import or write knowledge through the MCP server.

Keep host app identity as external references:

```json
{
  "scopeKind": "user",
  "scopeExternalRef": "user_123",
  "sourceApp": "acme-crm"
}
```

That metadata can live on a collection, document, or chunk depending on how broad the scope is. Retrieval code can then filter by allowed external refs without requiring a Prisma relation to the host app's `User` table.

## What not to do

Do not add Prisma relations from RAG tables to host app tables:

```prisma
// Do not do this unless you are intentionally forking the MCP contract.
model RagDocument {
  userId String
  user   User @relation(fields: [userId], references: [id])
}
```

That makes generic setup harder and can break MCP tools that create documents/chunks without knowing the host app's required fields.

## When to fork

Fork the schema only when the product needs hard database-level ownership guarantees inside the brain itself. If you do that, update and test every MCP write path, every import/export path, and every retrieval filter. Until then, metadata references keep the project generic and portable.
