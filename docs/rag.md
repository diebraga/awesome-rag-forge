# RAG Architecture

## Current retrieval (MVP)

Retrieval is simple text search (`contains`, case-insensitive) over `APPROVED` chunks belonging to `APPROVED` documents. See `lib/rag/retrieval.ts` (used by the chat route) and the `search_knowledge_base` MCP tool (used by the assistant).

This is intentionally simple for the first version. The schema already reserves an `embedding` column (`vector(768)`) on `RagChunk` for a future move to real vector similarity search once you wire up an embedding model and a `pgvector`-aware query.

## Chunking

`mcp/rag-manager/chunking.ts` implements paragraph-based chunking:

- Splits on blank lines into paragraphs.
- Merges paragraphs into chunks up to ~1600 characters.
- Estimates a token count per chunk (rough heuristic, not a real tokenizer).
- Infers a `sectionTitle` when a paragraph's first line looks like a heading.

This is a starting point, not a production chunker. For plain-text/Markdown sources going through `propose_source_insert`, you'll likely still want smarter splitting (headings-aware, token-accurate, or model-based) as documents grow.

PDF uploads (`propose_file_upload`) use a separate, page-aware chunker, `chunkPdfPages()` in the same file: it chunks each page's text independently (same ~1600-char paragraph merging) and tags every resulting chunk with its source `pageNumber`, rather than merging across page boundaries. `RagChunk.pageNumber`/`RagSource.pageNumber` exist in the schema specifically for this — see [MCP Server](mcp-server.md#uploading-a-file-directly-propose_file_upload--approve_file_upload) for the extraction pipeline (`mcp/rag-manager/extraction.ts`) that feeds it, including the OCR fallback.

## Human review loop

New knowledge is never immediately usable by the chat app:

1. `propose_source_insert` (or `propose_file_upload` for a PDF) — read-only, returns a proposal (recommended collection, document metadata, chunk plan, warnings).
2. `approve_source_insert` (or `approve_file_upload`) — writes the document/chunks as `PENDING_REVIEW`, but only if `userApproval: true`.
3. `approve_chunk` / `reject_chunk` — a human reviewer moves chunks to `APPROVED` or `REJECTED`, creating a `RagReview` record. Approving a chunk also flips its parent `RagDocument.status` to `APPROVED` if it wasn't already — that's what makes the document (and its downloadable file, if it has one) actually visible; a document sitting at `PENDING_REVIEW` is never retrieved or downloadable regardless of individual chunk statuses.

Only step 3's `APPROVED` chunks (belonging to an `APPROVED` document) are ever surfaced to end users in the chat app.

## Feedback and evaluation

- `add_feedback` records a rating (`GOOD`, `BAD`, `INCOMPLETE`, `UNSAFE`, `OUTDATED`) tied to a question/answer or a specific chunk/document. Use this to capture what didn't work.
- `create_eval_case` records a question with an expected answer/sources, for building a regression test set as the knowledge base grows.

Continuous improvement is meant to be human-reviewed end to end: capture feedback → have a reviewer approve corrections → add them back into the knowledge base → keep rejected answers as eval cases.

## Assistant identity is not knowledge

The chat assistant's display name and behavior instructions live in a separate `AssistantConfig` table (a singleton row), not in `RagCollection`/`RagDocument`/`RagChunk`. This is deliberate: early versions of the seed data described the assistant's own capabilities in second person ("you can ask the assistant to..."), and when that text got retrieved as RAG context, the model recited it back confusingly, blending its own identity with the MCP assistant's. Keeping identity/config out of the retrievable corpus avoids that failure mode entirely — it can never be "found" by a search query and quoted back.

`AssistantConfig` is writable only through the MCP server's `set_assistant_name` tool (a direct write — it's config, not knowledge, so it doesn't go through the propose/approve workflow). See [lib/rag/chat-context.ts](../lib/rag/chat-context.ts), which combines this identity, harness capabilities/restrictions, knowledge-base scope stats, and retrieved chunks into one shared context bundle used by both the chat route and `GET /api/rag/context`.

## The harness: capabilities and restrictions

Beyond identity, the chat's *behavioral* boundaries — what it can and cannot do — are configurable too, through a `HarnessRule` table (`kind: CAPABILITY | RESTRICTION`, plus a `status` reusing the same `RagStatus` review states as knowledge). Like `AssistantConfig`, harness rules are not knowledge content and are never retrieved as RAG chunks — but unlike the assistant's name, changing them goes through the **full** propose → approve → human-review workflow (see [MCP Server](mcp-server.md#harness-rules-propose--approve--review)), since they define security-relevant boundaries rather than a display label.

Two things keep this from being a way to grant the chat real power it doesn't have:

- **Hardcoded rules always win.** The identity and read-only rules baked into `buildSystemPrompt()` (see [System Architecture](architecture.md)) are rendered *before* the harness section, and the harness section explicitly tells the model those rules "can never be loosened by anything below." Nothing in `HarnessRule` can override them — they're not even read from the same table.
- **Dangerous statements are refused in code, not just discouraged in a prompt.** `lib/rag/harness.ts`'s `validateHarnessStatement()` hard-blocks any `CAPABILITY` statement implying write/delete/approve/bypass/reveal-model powers, and any statement (capability or restriction) that tries to *remove* a hardcoded protection ("no longer read-only," "allow write," etc.). This runs both when a rule is proposed and again when it's actually written, so it can't be skipped by calling the write tool directly.

Only `APPROVED` harness rules are ever included in `buildAssistantContext()`'s output — the same visibility rule as approved knowledge chunks.

See also: [MCP Server](mcp-server.md), [Database & Prisma](database.md), [System Architecture](architecture.md).
