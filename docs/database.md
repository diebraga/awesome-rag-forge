# Database & Prisma

## Setup model: `db push`, not migrations

This project currently uses `prisma db push` instead of `prisma migrate`. There is no `prisma/migrations` directory. This is intentional for early-stage iteration — schema changes are applied directly to your database without a migration history.

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

If you later want a real migration history (recommended before production), switch to `prisma migrate dev` and commit the generated migrations.

## Datasource

Any Postgres-compatible database works, including [Prisma Postgres](https://www.prisma.io/postgres) or a plain local Postgres instance. Set `DATABASE_URL` in `.env` (see [Environment Variables](environment-variables.md)).

The schema uses `Unsupported("vector(768)")` for the chunk embedding column, which requires the `pgvector` extension to be available on your Postgres instance (most managed Postgres-compatible providers, including Prisma Postgres, support this).

## Schema overview

| Model | Purpose |
| --- | --- |
| `RagCollection` | A named group of documents, e.g. "Onboarding Docs" or "API Reference". |
| `RagDocument` | A single source (file, URL, note) belonging to a collection. |
| `RagChunk` | A retrievable slice of a document's text, with an optional embedding. |
| `RagSource` | Citation metadata linking a chunk/document back to its origin. |
| `RagReview` | A human decision (approve/reject) on a document or chunk. |
| `RagFeedback` | User feedback on an answer or chunk (good/bad/incomplete/unsafe/outdated), plus MCP-only review/resolution fields. The one table the chat app can write to directly, via `POST /api/feedback` — see [System Architecture](architecture.md#the-core-boundary-read-vs-write) — as well as through the MCP server's `add_feedback` tool; both write to the same table. Feedback review itself is MCP-only; see [Feedback Review Loop](feedback-review-loop.md). |
| `RagEvalCase` | A test question with an expected answer, for future RAG quality evaluation. |
| `AssistantConfig` | Singleton row holding the chat assistant's display name and instructions. **Not knowledge content** — never retrieved or searched, writable only through the MCP server. |
| `HarnessRule` | A capability or restriction statement (`kind: CAPABILITY \| RESTRICTION`) describing what the chat can/cannot do, with the same review states as knowledge. **Not knowledge content** — only `APPROVED` rows are read into the system prompt; writable only through the MCP server's propose → approve → review flow. |

### Generic classification fields

Documents, collections, and eval cases share a generic metadata shape instead of domain-specific fields:

- `category` — a free-text category (e.g. "onboarding", "api-reference").
- `domain` — a free-text domain/subject area (e.g. "engineering", "support").
- `tags` — a string array for flexible filtering.
- `metadata` — a JSON field for anything else (e.g. `insertedBy`, `warnings`, custom attributes).

### Review workflow

`RagStatus` drives what the chat app is allowed to use:

```text
DRAFT → PENDING_REVIEW → APPROVED
                       ↘ REJECTED
APPROVED / REJECTED → ARCHIVED
```

Only `APPROVED` documents and chunks are read by `lib/rag/retrieval.ts`. `HarnessRule` reuses this same `RagStatus` enum for its own review states, and only `APPROVED` rows are read by `lib/rag/chat-context.ts`.

The `APPROVED → ARCHIVED` transition is driven by the MCP server's `archive_document` tool (see [MCP Server](mcp-server.md#removing-knowledge-archive_document)) — the only supported way to remove knowledge from use. It's a status change, not a row deletion: `RagReview`/`RagFeedback` history is preserved, and every read path already excludes non-`APPROVED` rows, so archiving is enough to make a document disappear from the chat, the Collections pages, and the download route without touching foreign-keyed audit data.

### `AssistantConfig` and `HarnessRule` are not part of this workflow

Neither is ever joined into retrieval/search queries — they're small, separate tables on purpose. `AssistantConfig` has no status at all (see [RAG Architecture](rag.md#assistant-identity-is-not-knowledge) for why identity/config must stay out of the searchable corpus). `HarnessRule` does reuse `RagStatus` for its review workflow, but it's a distinct table from `RagDocument`/`RagChunk` and never appears in `search_knowledge_base` results (see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions)).

## Regenerating the Prisma client

The client is generated into `generated/prisma` (gitignored) and runs automatically on `npm install` via the `postinstall` script. Run it manually after schema changes:

```bash
npx prisma generate
```
