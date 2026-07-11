# RAG Architecture

## Current retrieval (MVP)

The chat uses hybrid retrieval over `APPROVED` chunks belonging to `APPROVED` documents. The latest user question is passed into `lib/rag/retrieval.ts`, which runs semantic pgvector search when chunk embeddings are available, merges those candidates with lexical candidates, then ranks the union before building the prompt.

MCP proposals enrich each chunk with human-reviewable `metadata.retrievalAliases` such as canonical names, aliases/synonyms, category words, and likely user questions. Those aliases are folded into lexical scoring and into the text embedded at approval time. This is still behind the existing propose -> approve review path: aliases are proposal data and embeddings are written only when a chunk is approved through MCP.

Retrieval normalizes punctuation and spacing before scoring, so compact user phrasing such as `COEse` can match spaced stored knowledge such as `COES eindex`. Semantic search handles broader phrasing such as `tell me about the company` when the relevant chunk has an embedding. If no semantic or lexical candidates match, retrieval returns no context; the chat then follows the no-context branch and must not invent citations.

Embeddings use Ollama's `nomic-embed-text` by default (`OLLAMA_EMBED_MODEL`) and the existing `RagChunk.embedding vector(768)` column. Existing approved chunks can be backfilled with `npm run rag:embeddings:backfill` after running `ollama pull nomic-embed-text`.

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
4. **Or**, instead of step 3 for an already-reviewed chunk that just needs correcting: `propose_chunk_update` → `approve_chunk_update` (see [MCP Server](mcp-server.md#correcting-knowledge-propose_chunk_update--approve_chunk_update)). Editing an `APPROVED` chunk sends it back to `PENDING_REVIEW` — the loop re-enters at step 3, it doesn't skip it. Removal follows the same "never skip review" shape via `archive_document` (see [MCP Server](mcp-server.md#removing-knowledge-archive_document)).

Only step 3's `APPROVED` chunks (belonging to an `APPROVED` document) are ever surfaced to end users in the chat app.

## Feedback and evaluation

- `add_feedback` records a rating (`GOOD`, `BAD`, `INCOMPLETE`, `UNSAFE`, `OUTDATED`) tied to a question/answer or a specific chunk/document. Use this to capture what did or did not work.
- `get_feedback_summary`, `list_feedback_page`, and `get_feedback_case` provide a token-efficient MCP-only review flow: summarize first, page compact records second, and inspect full details only by ID.
- `create_eval_case` records a test question with an expected answer/sources, for building a regression test set as the knowledge base grows.
- `create_eval_case_from_feedback` turns a reviewed feedback item into an eval case with explicit user approval.
- `mark_feedback_resolved` closes the operational feedback review loop without changing live knowledge.

Continuous improvement is meant to be human-reviewed end to end: capture feedback → summarize/page feedback through MCP → inspect a specific case → create evals or propose corrections → approve corrections through the existing RAG/harness review workflow → mark feedback resolved. See [Feedback Review Loop](feedback-review-loop.md).

## Assistant identity is not knowledge

The chat assistant's display name and behavior instructions live in a separate `AssistantConfig` table (a singleton row), not in `RagCollection`/`RagDocument`/`RagChunk`. This is deliberate: early versions of the seed data described the assistant's own capabilities in second person ("you can ask the assistant to..."), and when that text got retrieved as RAG context, the model recited it back confusingly, blending its own identity with the MCP assistant's. Keeping identity/config out of the retrievable corpus avoids that failure mode entirely — it can never be "found" by a search query and quoted back.

`AssistantConfig` is writable only through the MCP server's `set_assistant_name` tool (a direct write — it's config, not knowledge, so it doesn't go through the propose/approve workflow). See [lib/rag/chat-context.ts](../lib/rag/chat-context.ts), which combines this identity, harness capabilities/restrictions, knowledge-base scope stats, and retrieved chunks into one shared context bundle used by both the chat route and `GET /api/rag/context`.

## The harness: capabilities and restrictions

Beyond identity, the chat's *behavioral* boundaries — what it can and cannot do — are configurable too, through a `HarnessRule` table (`kind: CAPABILITY | RESTRICTION`, plus a `status` reusing the same `RagStatus` review states as knowledge). Like `AssistantConfig`, harness rules are not knowledge content and are never retrieved as RAG chunks — but unlike the assistant's name, changing them goes through the **full** propose → approve → human-review workflow (see [MCP Server](mcp-server.md#harness-rules-propose--approve--review)), since they define security-relevant boundaries rather than a display label.

Two things keep this from being a way to grant the chat real power it doesn't have:

- **Hardcoded rules always win.** The identity and read-only rules baked into `buildSystemPrompt()` (see [System Architecture](architecture.md)) are rendered *before* the harness section, and the harness section explicitly tells the model those rules "can never be loosened by anything below." Nothing in `HarnessRule` can override them — they're not even read from the same table.
- **Dangerous statements are refused in code, not just discouraged in a prompt.** `lib/rag/harness.ts`'s `validateHarnessStatement()` hard-blocks any `CAPABILITY` statement implying write/delete/approve/bypass/reveal-model powers (a synonym-aware blocklist, not just literal words), requires every `CAPABILITY` statement to also match a known-safe read-only verb allowlist (default-deny for anything unrecognized), and blocks any statement (capability or restriction) that tries to *remove* a hardcoded protection ("no longer read-only," "allow write," etc.). This runs both when a rule is proposed and again when it's actually written, so it can't be skipped by calling the write tool directly. See `docs/security.md` and `lib/rag/harness.test.ts` for the full rationale and the evasion cases it's tested against.

Only `APPROVED` harness rules are ever included in `buildAssistantContext()`'s output — the same visibility rule as approved knowledge chunks.

See also: [MCP Server](mcp-server.md), [Database & Prisma](database.md), [System Architecture](architecture.md).
