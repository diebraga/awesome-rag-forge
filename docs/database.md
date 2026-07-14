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

Any Postgres-compatible database with `pgvector` works, including [Prisma Postgres](https://www.prisma.io/postgres), Supabase, Neon, RDS/Postgres with the extension enabled, or the included Docker local Postgres service. See [Local Postgres Setup](local-postgres.md) for the Docker-first path. Set `DATABASE_URL` in `.env` (see [Environment Variables](environment-variables.md)); `.env.example` leaves it empty so setup agents must ask the user for a real connection string instead of guessing.

This project is domain-agnostic, not database-engine-agnostic. It does **not** currently support MongoDB, SQLite, MySQL, or document databases. Supporting those would require changing the Prisma datasource/provider, replacing the `vector(768)`/`pgvector` storage model, and retesting the app and MCP server paths.

If `DATABASE_URL` is present but unreachable or invalid, the app shows a database connection error before rendering the testing surface, and testing API routes return `503` with a sanitized setup message. The UI/API must never echo the full connection string or raw provider error because it may contain credentials.

The schema uses `Unsupported("vector(768)")` for the chunk embedding column, which requires the `pgvector` extension to be available on your Postgres instance (most managed Postgres-compatible providers, including Prisma Postgres, support this).

## Schema overview

| Model | Purpose |
| --- | --- |
| `KnowledgeScope` | Generic context boundary for knowledge (`GLOBAL`, `USER`, `ORGANIZATION`, `PROJECT`, etc.). Not an auth/user table; host apps own identity and pass external refs. |
| `RagCollection` | A named group of documents, e.g. "Onboarding Docs" or "API Reference". |
| `RagDocument` | A single source (file, URL, note) belonging to a collection. |
| `RagChunk` | A retrievable slice of a document's text, with an optional embedding. |
| `RagSource` | Citation metadata linking a chunk/document back to its origin. |
| `RagReview` | A human decision (approve/reject) on a document or chunk. |
| `RagFeedback` | User feedback on an answer or chunk (good/bad/incomplete/unsafe/outdated), plus MCP-only review/resolution fields. The one table the chat app can write to directly, via `POST /api/feedback` — see [System Architecture](architecture.md#the-core-boundary-read-vs-write) — as well as through the MCP server's `add_feedback` tool; both write to the same table. Feedback review itself is MCP-only; see [Feedback Review Loop](feedback-review-loop.md). |
| `RagEvalCase` | A test question with an expected answer, for future RAG quality evaluation. |
| `AssistantConfig` | Singleton row holding the chat assistant's display name and instructions. **Not knowledge content** — never retrieved or searched, writable only through the MCP server. |
| `HarnessRule` | A capability or restriction statement (`kind: CAPABILITY \| RESTRICTION`) describing what the chat can/cannot do, with the same review states as knowledge. **Not knowledge content** — only `APPROVED` rows are read into the system prompt; proposed through the MCP server and finally approved/rejected through MCP or the local-only `/review` page. |

### Generic classification fields

Documents, collections, and eval cases share a generic metadata shape instead of domain-specific fields:

- `category` — a free-text category (e.g. "onboarding", "api-reference").
- `domain` — a free-text domain/subject area (e.g. "engineering", "support").
- `tags` — a string array for flexible filtering.
- `metadata` — a JSON field for anything else (e.g. `insertedBy`, `warnings`, custom attributes).

Collections and documents also include governance fields:

- `audience` — `EXTERNAL`, `INTERNAL`, or `RESTRICTED`.
- `visibility` — a `RagVisibility[]` containing any of `CHAT`, `OPERATOR`, `REVIEW`, `EVAL`.

End-user chat/read-only routes require both the collection and document to be `EXTERNAL` and include `CHAT`; MCP tools can manage all audiences.

For portability, these tables may be exported/imported into any Postgres database with `pgvector`; see [Portable Brain](portable-brain.md) and [Export / Import](export-import.md). Snapshots intentionally skip vector embeddings, so run `npm run rag:embeddings:backfill` after import.

Per-person, per-company, or per-project personalization uses the generic `KnowledgeScope` table and nullable `scopeId` fields instead of a full `User` auth model. A scope can reference an external user/profile/workspace id through `externalRef`, while the external application keeps owning login, roles, billing, and organization data. KnowledgeScope rows are portable context labels: `kind`, `label`, optional `externalRef`, and metadata. `externalRef` can point to a host app user/company/project id, but the host app remains responsible for auth and permissions. Custom app tables may exist beside the RAG schema, but do not add required Prisma relations from `RagCollection`, `RagDocument`, or `RagChunk` to those tables unless you are intentionally updating the MCP server's write contract. See [Scoped Knowledge](scoped-knowledge.md) for the intended schema boundary.

### Review workflow

`RagStatus` drives what the chat app is allowed to use:

```text
DRAFT → APPROVED
DRAFT → PENDING_REVIEW → APPROVED
                       ↘ REJECTED
APPROVED / REJECTED → ARCHIVED
```

Only `APPROVED`, `EXTERNAL`, `CHAT`-visible documents and chunks are read by `lib/rag/retrieval.ts`. Clean MCP-approved knowledge can be written directly as `APPROVED`; ambiguous/problematic knowledge is written as `PENDING_REVIEW` with `reviewReason` metadata. `HarnessRule` reuses this same `RagStatus` enum for its own review states, and only `APPROVED` rows scoped to `USER_CHAT` or `ALL` are read by `lib/rag/chat-context.ts`.

The `APPROVED → ARCHIVED` transition is normally driven by the MCP server's `archive_document` tool (see [MCP Server](mcp-server.md#removing-knowledge-archive_document)); the local Collections detail page can also soft-archive already-approved visible documents/chunks after warning and reason. It's a status change, not a row deletion: `RagReview`/`RagFeedback` history is preserved, and every read path already excludes non-`APPROVED` rows, so archiving is enough to make content disappear from the chat, the Collections pages, and the download route without touching foreign-keyed audit data.

### `AssistantConfig` and `HarnessRule` are not part of this workflow

Neither is ever joined into retrieval/search queries — they're small, separate tables on purpose. `AssistantConfig` has no status at all (see [RAG Architecture](rag.md#assistant-identity-is-not-knowledge) for why identity/config must stay out of the searchable corpus). `HarnessRule` does reuse `RagStatus` for its review workflow, but it's a distinct table from `RagDocument`/`RagChunk` and never appears in `search_knowledge_base` results (see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions)).

## Regenerating the Prisma client

The client is generated into `generated/prisma` (gitignored) and runs automatically on `npm install` via the `postinstall` script. Run it manually after schema changes:

```bash
npx prisma generate
```
