# RAG Architecture

## Current retrieval (MVP)

Retrieval is simple text search (`contains`, case-insensitive) over `APPROVED` chunks belonging to `APPROVED` documents. See `lib/rag.ts` (used by the chat route) and the `search_knowledge_base` MCP tool (used by the assistant).

This is intentionally simple for the first version. The schema already reserves an `embedding` column (`vector(768)`) on `RagChunk` for a future move to real vector similarity search once you wire up an embedding model and a `pgvector`-aware query.

## Chunking

`mcp/rag-manager/chunking.ts` implements paragraph-based chunking:

- Splits on blank lines into paragraphs.
- Merges paragraphs into chunks up to ~1600 characters.
- Estimates a token count per chunk (rough heuristic, not a real tokenizer).
- Infers a `sectionTitle` when a paragraph's first line looks like a heading.

This is a starting point, not a production chunker. If you bring in PDFs or large documents, you'll likely want smarter splitting (headings-aware, token-accurate, or model-based).

## Human review loop

New knowledge is never immediately usable by the chat app:

1. `propose_source_insert` — read-only, returns a proposal (recommended collection, document metadata, chunk plan, warnings).
2. `approve_source_insert` — writes the document/chunks as `PENDING_REVIEW`, but only if `userApproval: true`.
3. `approve_chunk` / `reject_chunk` — a human reviewer moves chunks to `APPROVED` or `REJECTED`, creating a `RagReview` record.

Only step 3's `APPROVED` chunks are ever surfaced to end users in the chat app.

## Feedback and evaluation

- `add_feedback` records a rating (`GOOD`, `BAD`, `INCOMPLETE`, `UNSAFE`, `OUTDATED`) tied to a question/answer or a specific chunk/document. Use this to capture what didn't work.
- `create_eval_case` records a question with an expected answer/sources, for building a regression test set as the knowledge base grows.

Continuous improvement is meant to be human-reviewed end to end: capture feedback → have a reviewer approve corrections → add them back into the knowledge base → keep rejected answers as eval cases.

See also: [MCP Server](mcp-server.md), [Database & Prisma](database.md).
