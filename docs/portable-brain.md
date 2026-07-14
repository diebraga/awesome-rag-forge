# Portable Brain

The portable brain is the Awesome RAG Forge knowledge package: collections, documents, chunks, sources, review state, feedback, eval cases, assistant config, and harness rules. It is designed to move between Postgres databases without becoming part of a host application's auth or user schema.

## What portable means

Portable means **Postgres-compatible with `pgvector` enabled**. It does not mean database-engine-agnostic. The current schema depends on Prisma's PostgreSQL provider and `RagChunk.embedding` as `vector(768)`, so MongoDB, SQLite, MySQL, and document databases require code changes.

Supported targets include local Docker Postgres, Supabase, Neon, Prisma Postgres, RDS Postgres, and any Postgres service where `CREATE EXTENSION vector` is available.

## Boundary with host apps

A host app can have users, organizations, teams, billing, projects, and permissions. Awesome RAG Forge should not own those tables and should not add direct foreign-key relationships to them.

Use this pattern instead:

- Keep the RAG tables exactly as the MCP server expects them.
- Store external ownership/access references in `metadata` or a generic scope layer, for example `scopeKind: "user"` and `scopeExternalRef: "user_123"`.
- Let the host app decide which external refs the current user can read or write.
- Let Awesome RAG Forge organize, retrieve, review, and improve knowledge by scope/audience/visibility.

Do not add required `userId`, `tenantId`, or `organizationId` fields to `RagCollection`, `RagDocument`, or `RagChunk` unless you are intentionally forking the MCP write contract and updating every create/update path.

## What is exported

By default, `npm run brain:export` exports approved operational brain state:

- `RagCollection`
- approved `RagDocument`
- approved `RagChunk` without vector embeddings
- `RagSource`
- `AssistantConfig`
- approved `HarnessRule`
- `RagEvalCase`

Optional flags can include pending review rows and feedback/review history. Embeddings are intentionally not exported because they are stored in `pgvector`; run `npm run rag:embeddings:backfill` after import.

## Wizard-first local UI

The local testing UI includes `/portable-brain`, an action-first wizard for exporting, importing, and connecting this brain to another project. It shows status and counts up front, then gives buttons for `Export Brain`, `Import Brain`, and `Connect Project`. Advanced CLI commands stay available, but they are not the first thing a user has to understand.

The page is local-only. It is not a hosted admin panel and not an MCP client. Import still performs a dry run before apply, and snapshots still exclude secrets and embeddings.

## Agent rule

When a user asks to move this brain into another project or database, do not create host-app relationships. First configure a Postgres database with `pgvector`, run `npx prisma db push`, run a dry-run import, then apply only after the user approves the target.
