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
| `RagFeedback` | User feedback on an answer or chunk (good/bad/incomplete/unsafe/outdated). |
| `RagEvalCase` | A test question with an expected answer, for future RAG quality evaluation. |

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

Only `APPROVED` documents and chunks are read by `lib/rag.ts`.

## Regenerating the Prisma client

The client is generated into `generated/prisma` (gitignored) and runs automatically on `npm install` via the `postinstall` script. Run it manually after schema changes:

```bash
npx prisma generate
```
