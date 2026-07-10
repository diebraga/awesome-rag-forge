# MCP Server

The MCP server lives at `mcp/rag-manager/` and manages the RAG knowledge base through Prisma. It is the **only** supported write path into the database. The Next.js chat app is a read-only viewer — it never writes knowledge, only reads `APPROVED` chunks — and every creation, edit, approval, rejection, or archival action must go through this server's tools. See [System Architecture](architecture.md) for the full read/write boundary.

## Running it locally

```bash
npm run mcp:rag-manager
```

This starts the server on stdio transport, which is how local MCP clients (Claude Desktop, Codex CLI, etc.) expect to talk to it.

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
| `propose_file_upload` | **No** | Extract text from an uploaded PDF (OCR fallback for scanned pages) and propose a document/chunk plan. Does not upload anything to storage. |
| `approve_file_upload` | Yes (if approved) | Persist the proposal's document/chunks as `PENDING_REVIEW`, only when `userApproval: true`. Also uploads the original file to storage — requiring storage to be configured — only when `storeOriginalFile: true`; the caller must have asked the user which mode they want. |
| `list_pending_reviews` | No | List documents/chunks awaiting review. |
| `approve_chunk` | Yes | Mark a chunk `APPROVED`, flip its parent document to `APPROVED` too (so it actually becomes visible to the chat/download route), and log a review. |
| `reject_chunk` | Yes | Mark a chunk `REJECTED` and log a review. |
| `add_feedback` | Yes | Record feedback on an answer or chunk. |
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

instead of silently storing anything. It is fine to store extracted text in the database without storage configured — only original file bytes require it. This repo does not include a bucket client implementation; wire one into `lib/storage.ts` for your provider of choice (S3, R2, GCS, etc.) before enabling uploads.

It also requires `userApproval: true` — it can modify an already-`APPROVED`, live document, so show the user which document/file before calling it. And it merges into the document's existing `metadata` instead of overwriting the field, so attaching a file never silently destroys metadata set during ingestion (e.g. `insertedBy`, `warnings`).

## Uploading a file directly: `propose_file_upload` → `approve_file_upload`

For the common case of "here's a PDF, extract its knowledge and (maybe) keep the original for download," `propose_file_upload`/`approve_file_upload` combine what `propose_source_insert`/`approve_source_insert`/`attach_document_file` would otherwise require several separate calls to do:

1. `propose_file_upload` — takes `fileName` and `fileBase64` (the whole file, base64-encoded; capped at ~15MB of raw file data since it round-trips through the calling model's context on both the propose and approve calls). It validates the `%PDF` magic bytes, extracts text page-by-page via [`mcp/rag-manager/extraction.ts`](../mcp/rag-manager/extraction.ts) (`pdf-parse`'s text layer first; any page with almost no extractable text — likely scanned/photographed — is rasterized and run through `tesseract.js` OCR instead), then builds a page-numbered chunk plan via `chunkPdfPages()` in [`chunking.ts`](../mcp/rag-manager/chunking.ts). Read-only: no database write, no storage upload. The proposal's warnings call out how many pages needed OCR, so a reviewer knows to double-check accuracy there.
2. **Before calling `approve_file_upload`, the calling assistant must always ask the user to choose between two modes** — this is stated directly in `propose_file_upload`'s tool description and its `requiredUserQuestion`, not left to inference: extract text only (nothing enters the storage bucket, no storage configuration needed at all), or also store the original file for later download. Never assume one or the other, even if storage happens to be configured.
3. `approve_file_upload` — takes the same proposal back plus `fileName`/`fileBase64` again (the actual bytes have to be resupplied; the DB proposal alone doesn't carry binary data), the user's `storeOriginalFile` choice from step 2, and `userApproval: true`. When `storeOriginalFile: true`, it refuses exactly like `attach_document_file` if storage isn't configured, then uploads the file under a generated key and sets `storageKey` on the document. When `storeOriginalFile: false`, it skips storage entirely — no upload, `storageKey` stays `null`, and it works with no storage env vars configured at all. Either way, the collection/document/chunks/sources are created in one transaction, all `PENDING_REVIEW` until a human runs `approve_chunk` on the resulting chunks.

Every `RagChunk`/`RagSource` created this way carries a `pageNumber`, so citations and future review UIs can point at the exact page rather than just the document as a whole. `RagDocument.metadata.fileStored` records which mode was used.

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

## Connecting to Claude Desktop or Codex

Add an entry pointing at this repo's checkout, for example (Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rag-manager": {
      "command": "npm",
      "args": ["run", "mcp:rag-manager"],
      "cwd": "/absolute/path/to/your/local/clone/rag-builder-mcp"
    }
  }
}
```

`cwd` **must** point at your local clone — the MCP server is not hosted anywhere. See [Deployment](deployment.md) for why the deployed app and the MCP server are separate things.

## Example prompts

- "Show me my current knowledge base."
- "Add this source to the knowledge base." (paste text)
- "Upload this PDF to the knowledge base." (with a file attached)
- "Search what we know about onboarding."
- "Approve this pending chunk."
- "Create an eval case for [question]."
