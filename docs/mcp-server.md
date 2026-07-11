# MCP Server

The MCP server lives at `mcp/rag-manager/` and manages the RAG knowledge base through Prisma. It is the **only** supported write path into the database. The Next.js chat app is a read-only viewer — it never writes knowledge, only reads `APPROVED` chunks — and every creation, edit, approval, rejection, or archival action must go through this server's tools. See [System Architecture](architecture.md) for the full read/write boundary.

Opening the Next.js app in a browser does not connect this MCP server. The browser UI can test approved knowledge, browse approved collections/harness state, submit narrow answer feedback, and use local setup helpers, but it must not be treated as an MCP client. To create or manage RAG/harness data, connect an MCP-capable assistant to this server over stdio from the local clone.

After setup or registration, explain this boundary to the user with [Post-Install Handoff](post-install-handoff.md).

## Running it locally

```bash
npm run mcp:rag-manager
```

This starts the server on stdio transport, which is how local MCP clients (Claude Desktop, Codex CLI, etc.) expect to talk to it.

### HTTP transport (for a web-based client, e.g. a future review dashboard)

```bash
npm run mcp:rag-manager:http
```

Starts the exact same server — same tools, same `mcp/rag-manager/server.ts` (the `server` instance is exported and reused, see `mcp/rag-manager/http.ts`) — over `StreamableHTTPServerTransport` at `http://127.0.0.1:3200/mcp` instead of stdio. Use this only when a client can't be spawned as a stdio subprocess (a web page, for instance); stdio remains the default and the only transport Claude Desktop/Cursor/etc. need.

- **Bound to `127.0.0.1` by default, on purpose.** Override with `MCP_HTTP_HOST`/`MCP_HTTP_PORT`, but this server has full read/write access to the knowledge base (see [Security Considerations](security.md#mcp-server-trust-boundary)) — widening the bind address means putting real authentication in front of it first, not just changing an env var. There is no auth on this transport today.
- Both entry points share one tool registry — a tool added to `mcp/rag-manager/server.ts` is automatically available over both transports; there is nothing HTTP-specific to update per tool.


## Operating boundary

The MCP server is allowed to create and manage the RAG knowledge base and harness through its supported tools. Database writes performed by these tools are normal MCP Operator Mode actions, including approval-gated writes and archival actions. Developer Mode is only for changing repository files, folder structure, Prisma schema files, dependencies, scripts, or application code. See [Operating Modes](operating-modes.md).

## Tools

| Tool | Writes to DB? | Purpose |
| --- | --- | --- |
| `list_collections` | No | List existing collections. |
| `create_collection` | Yes (if approved) | Create a new collection, but only when `userApproval: true`. |
| `list_documents` | No | List documents, optionally filtered. |
| `search_knowledge_base` | No | Text search over chunks. |
| `propose_source_insert` | **No** | Analyze source text and propose collection/document/chunk plan. |
| `approve_source_insert` | Yes (if approved) | Persist a proposal, but only when `userApproval: true`. |
| `attach_document_file` | Yes (if storage configured and approved) | Record a `storageKey` for an original file; refuses if storage env vars are missing or `userApproval` isn't `true`. |
| `archive_document` | Yes (if approved) | Archive a document and its chunks (`status: ARCHIVED`), optionally deleting its stored file, only when `userApproval: true`. Never hard-deletes rows. |
| `propose_chunk_update` | **No** | Show a before/after diff for a correction to an existing chunk's text. Does not write. |
| `approve_chunk_update` | Yes (if approved) | Persist the correction, only when `userApproval: true`. Resets the chunk to `PENDING_REVIEW` if it was `APPROVED`. |
| `propose_file_upload` | **No** | Extract text from an uploaded PDF (OCR fallback for scanned pages) and propose a document/chunk plan. Does not upload anything to storage. |
| `approve_file_upload` | Yes (if approved) | Persist the proposal's document/chunks as `PENDING_REVIEW`, only when `userApproval: true`. Uploads the original file only when `storeOriginalFile: true` and storage is configured; otherwise falls back to text-only storage and says so clearly. |
| `propose_file_upload_batch` | **No** | Analyze multiple PDFs, extract/OCR/sanitize text, and propose one document per file with organization rationale. Does not write or upload. |
| `approve_file_upload_batch` | Yes (if approved) | Persist multiple proposed PDF uploads as `PENDING_REVIEW`, one document per file, only when `userApproval: true`; reuses matching batch collections and applies each file's storage choice. |
| `list_pending_reviews` | No | List documents/chunks awaiting review. |
| `approve_chunk` | Yes | Mark a chunk `APPROVED`, flip its parent document to `APPROVED` too (so it actually becomes visible to the chat/download route), and log a review. |
| `reject_chunk` | Yes | Mark a chunk `REJECTED` and log a review. |
| `add_feedback` | Yes | Record feedback on an answer or chunk. |
| `get_feedback_summary` | No | Summarize feedback counts and recent trends before fetching individual records. |
| `list_feedback_page` | No | List a small compact page of feedback records, defaulting to unresolved negative feedback. |
| `get_feedback_case` | No | Inspect full details for one feedback item by ID. |
| `create_eval_case_from_feedback` | Yes (if approved) | Create a passing/regression eval case from feedback, only when `userApproval: true`. |
| `mark_feedback_resolved` | Yes (if approved) | Mark feedback reviewed/resolved, only when `userApproval: true`; does not change live knowledge. |
| `create_eval_case` | Yes | Record a test question for future evaluation. |
| `get_assistant_config` | No | Read the chat assistant's current name/instructions. |
| `set_assistant_name` | Yes (direct) | Set the chat assistant's name/instructions. The **only** way to change it. |
| `get_harness_rules` | No | List harness capability/restriction rules, optionally filtered by status or kind. |
| `propose_harness_update` | **No** | Analyze a requested capability/restriction and propose a structured rule, or refuse it. |
| `approve_harness_update` | Yes (if approved) | Persist a proposal as `PENDING_REVIEW`, but only when `userApproval: true`. |
| `approve_harness_rule` | Yes | Mark a harness rule `APPROVED` so it takes effect in the chat's system prompt. |
| `reject_harness_rule` | Yes | Mark a harness rule `REJECTED`. |

## The safety rule

**The assistant must call `propose_source_insert` before writing anything new.** It must show the proposal to the user and ask an explicit approval question before calling `approve_source_insert` with `userApproval: true`. New knowledge always starts as `PENDING_REVIEW` — nothing skips human review to become `APPROVED`.

A proposal includes:

- the recommended collection (existing or new)
- the document title and source type
- category / domain / tags
- the chunking plan
- source/citation metadata
- an explicit list of warnings (e.g. "no category or domain was provided")

## Document attachments require storage configuration and approval

`attach_document_file` calls `isStorageConfigured()` from `lib/storage.ts`, which checks for `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY`. If any are missing, the tool returns:

> Document storage is not configured. Add bucket/storage environment variables before uploading files.

instead of silently storing anything. It is fine to store extracted text in the database without storage configured — only original file bytes require it. `lib/storage.ts` includes an S3-compatible client: use AWS S3 by leaving `STORAGE_ENDPOINT` unset, or use providers like Cloudflare R2/MinIO by setting `STORAGE_ENDPOINT`.

It also requires `userApproval: true` — it can modify an already-`APPROVED`, live document, so show the user which document/file before calling it. And it merges into the document's existing `metadata` instead of overwriting the field, so attaching a file never silently destroys metadata set during ingestion (e.g. `insertedBy`, `warnings`).

## Uploading a file directly: `propose_file_upload` → `approve_file_upload`

For the common case of "here's a PDF, extract its knowledge and (maybe) keep the original for download," `propose_file_upload`/`approve_file_upload` combine what `propose_source_insert`/`approve_source_insert`/`attach_document_file` would otherwise require several separate calls to do:

1. `propose_file_upload` — takes `fileName` and `fileBase64` (the whole file, base64-encoded; capped at ~15MB of raw file data since it round-trips through the calling model's context on both the propose and approve calls). It validates the `%PDF` magic bytes, extracts text page-by-page via [`mcp/rag-manager/extraction.ts`](../mcp/rag-manager/extraction.ts) (`pdf-parse`'s text layer first; any page with almost no extractable text — likely scanned/photographed — is rasterized and run through `tesseract.js` OCR instead), then builds a page-numbered chunk plan via `chunkPdfPages()` in [`chunking.ts`](../mcp/rag-manager/chunking.ts). Read-only: no database write, no storage upload. The proposal's warnings call out how many pages needed OCR, so a reviewer knows to double-check accuracy there.
2. **Before calling `approve_file_upload`, the calling assistant must always ask the user to choose between two modes** — this is stated directly in `propose_file_upload`'s tool description and its `requiredUserQuestion`, not left to inference: extract text only (nothing enters the storage bucket, no storage configuration needed at all), or also store the original file for later download. Never assume one or the other, even if storage happens to be configured.
3. `approve_file_upload` — takes the same proposal back plus `fileName`/`fileBase64` again (the actual bytes have to be resupplied; the DB proposal alone doesn't carry binary data), the user's `storeOriginalFile` choice from step 2, and `userApproval: true`. When `storeOriginalFile: true` and storage is configured, it uploads the file under a generated key and sets `storageKey` on the document. When storage is not configured, it falls back to text-only storage and says so clearly instead of refusing the whole knowledge ingest. When `storeOriginalFile: false`, it skips storage entirely — no upload, `storageKey` stays `null`, and it works with no storage env vars configured at all. Either way, the collection/document/chunks/sources are created in one transaction, all `PENDING_REVIEW` until a human runs `approve_chunk` on the resulting chunks.

Every `RagChunk`/`RagSource` created this way carries a `pageNumber`, so citations and future review UIs can point at the exact page rather than just the document as a whole. Extracted text is normalized before chunking: repeated whitespace is collapsed, soft line-break hyphenation is repaired, and paragraph boundaries are kept where possible. `RagDocument.metadata.fileStored` records which mode was used.

For multiple PDFs, use `propose_file_upload_batch` -> `approve_file_upload_batch`. The batch tools still keep one document per PDF for citations, downloads, review, and archive safety. The assistant should reason about organization from the user's prompt, filenames, category/domain/tags, and existing collection IDs: group related files into one collection when that helps later search, or keep classifications separate when the files cover different subjects. Batch approval reuses a newly created collection for files with the same proposed collection signature, rather than creating duplicate collections.

## Removing knowledge: `archive_document`

There is no `delete_document` tool, deliberately. `archive_document` is the only supported way to take a document out of use, and it never hard-deletes a database row — it sets `RagDocument.status` and all of its chunks' `status` to `ARCHIVED`, which every read path (`lib/rag/retrieval.ts`, `lib/rag/collections.ts`, the download route) already filters out by requiring `status: "APPROVED"`. Soft-deleting this way keeps `RagReview` and `RagFeedback` history intact instead of cascading them away, which is the whole point — you can see *that* something was archived and *why*, not just watch it vanish.

- Requires `reason: string` (non-empty) — every archive action is self-documenting, recorded into `RagDocument.metadata.archivedReason`/`archivedAt`.
- Requires `userApproval: true` like every other write tool — refuses otherwise. This can modify an already-`APPROVED`, live document, so confirm with the user which document and why before calling it, the same way `attach_document_file` does.
- `deleteStoredFile: boolean` (default `false`) controls whether the original file is also permanently removed from the bucket via `deleteFileFromStorage()`. If there's no stored file, or storage isn't configured, this is a no-op with a warning in the response rather than a hard failure — the document still gets archived either way. The database update always runs first; if the storage delete fails afterward, the response includes a warning instead of rolling back the archive, since a failed bucket cleanup is just an orphaned object (the document is already unreachable through every read path), never a broken link or an inconsistent state.

## Correcting knowledge: `propose_chunk_update` → `approve_chunk_update`

For fixing a typo, updating a stale fact, or otherwise correcting a chunk's text without archiving and re-adding the whole document:

1. `propose_chunk_update` — read-only. Takes `chunkId` and the corrected `chunkText` (and optionally `sectionTitle`), loads the existing chunk, and returns a `before`/`after` diff (old text, new text, old/new token counts) plus `willReenterReview: true` if the chunk is currently `APPROVED`. Shows the reviewer exactly what's changing before anything is written.
2. `approve_chunk_update` — takes the same `chunkId`/`chunkText`/`sectionTitle` plus `userApproval: true`. Refuses otherwise. Updates the chunk's text and token count, and — the important part — **if the chunk was `APPROVED`, its status resets to `PENDING_REVIEW`.** An edited fact is not the same fact as the one that was originally reviewed; it doesn't inherit that approval. A human must run `approve_chunk` again after an edit, exactly as if it were new. The parent `RagDocument` and its other chunks are untouched — only the edited chunk drops out of the live chat until re-approved.

Every edit is logged as a `RagReview` row (`status: PENDING`) with the old and new text in `notes`, so there's a record of what changed, not just that something did.

## Feedback review loop

Feedback review is MCP-only and token-efficient by design. Start with `get_feedback_summary`, then use `list_feedback_page` for a small queue, then `get_feedback_case` for one selected item. Do not load every feedback row into the assistant context.

The default queue is unresolved negative feedback. Positive feedback is mostly aggregate signal and should be fetched explicitly when looking for passing eval candidates.

`create_eval_case_from_feedback` and `mark_feedback_resolved` both require `userApproval: true`. Neither changes live knowledge. If a feedback item reveals missing or wrong knowledge, use the existing `propose_source_insert`/`approve_source_insert` or `propose_chunk_update`/`approve_chunk_update` workflow; if it reveals a behavior issue, use the harness proposal workflow. See [Feedback Review Loop](feedback-review-loop.md).

## Assistant identity: `set_assistant_name`

`set_assistant_name` writes directly to `AssistantConfig` (no propose/approve step — it's configuration, not knowledge). It is the only supported way to:

- Give the read-only chat a fixed display name (e.g. "Archivist") instead of a generic/default one.
- Set custom identity instructions appended to its system prompt.

The chat app cannot rename itself, and this name is never stored as a `RagDocument`/`RagChunk` — it can't be retrieved by a search query and recited back as content. This also means the identity is **model-agnostic**: whatever LLM is actually running behind `/api/chat` (or any other agent that calls `GET /api/rag/context`) inherits the same name and the same instruction to never reveal the underlying model/provider, because that logic lives in [`lib/rag/chat-context.ts`](../lib/rag/chat-context.ts), not in model-specific code. See [RAG Architecture](rag.md#assistant-identity-is-not-knowledge).

## Harness rules: propose → approve → review

Harness rules (`HarnessRule`) describe what the read-only chat can and cannot do, on top of the hardcoded identity/read-only rules — which they can never loosen (see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions)). Changing them is the **most** guarded write path in this server — a three-stage flow, one stage more than knowledge:

1. `propose_harness_update` — read-only. Runs the request through [`lib/rag/harness.ts`](../lib/rag/harness.ts)'s `validateHarnessStatement()`, a hardcoded check that refuses any `CAPABILITY` statement implying write/delete/approve/bypass/reveal-model powers, and any statement trying to remove a hardcoded protection. If it passes, returns a structured proposal; if not, returns a refusal with a reason. Never writes anything.
2. `approve_harness_update` — writes the rule as `PENDING_REVIEW`, but only when `userApproval: true`, and **re-validates the statement again at write time** — it never trusts that step 1 was actually followed by whatever called it.
3. `approve_harness_rule` / `reject_harness_rule` — a human reviewer makes the final call. Only `approve_harness_rule` moves a rule to `APPROVED`, at which point it appears in the system prompt of every connected agent on the next request.

This means even a fully compromised or adversarial MCP client cannot grant the chat a capability it doesn't have: the blocklist is enforced in code at both the propose and write steps, independent of what the calling model claims or intends.

## Connecting to Claude Code, Claude Desktop, or Codex

**Claude Code (recommended — scriptable, easiest for an AI assistant to run unattended):** from inside your local clone, run

```bash
claude mcp add rag-manager -- npm run mcp:rag-manager
```

This registers the server scoped to the exact current directory (`claude mcp get rag-manager` / `claude mcp list` to verify; `claude mcp remove rag-manager` to undo). **If you ever rename or move the project folder, this registration becomes orphaned** — it's keyed to the old path and won't resolve, even though nothing looks wrong in the repo itself. Re-run the command above from the new location to fix it; there's no way to "repair" the old entry in place.

**Claude Desktop** (no CLI equivalent — edit its config directly): add an entry pointing at this repo's checkout to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rag-manager": {
      "command": "npm",
      "args": ["run", "mcp:rag-manager"],
      "cwd": "/absolute/path/to/your/local/clone/awesome-rag-forge"
    }
  }
}
```

`cwd` **must** point at your local clone — the MCP server is not hosted anywhere. See [Deployment](deployment.md) for why the deployed app and the MCP server are separate things.

Either way, the server only connects to whichever client launched it *at that client's next session start* — an already-running session won't pick up a registration added mid-conversation.

## Example prompts

- "Show me my current knowledge base."
- "Add this source to the knowledge base." (paste text)
- "Upload this PDF to the knowledge base." (with a file attached)
- "Search what we know about onboarding."
- "Approve this pending chunk."
- "Fix the typo in this chunk." / "Update this fact — the warranty is now 3 years, not 5."
- "Archive this document, it's outdated."
- "Create an eval case for [question]."
