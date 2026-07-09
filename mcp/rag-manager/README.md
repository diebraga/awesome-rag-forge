# RAG Manager MCP

RAG Manager MCP is an isolated MCP server for managing this project's generic RAG knowledge base.

It lives inside this Next.js repo, but it is separate from the app UI. That makes it possible to add more MCP servers later under `mcp/<name>/`.

## Run

```bash
npm run mcp:rag-manager
```

The server uses stdio transport, which is the normal local MCP mode for Claude/Codex-style clients.

## Required Environment

The MCP server reads `DATABASE_URL` from `.env`.

Do not commit `.env`.

## Safety Workflow

The server must not silently add knowledge.

Use this flow:

1. Call `propose_source_insert`.
2. Show the proposal to the user.
3. Ask: "Do you want me to save this to the knowledge base?"
4. Only after approval, call `approve_source_insert` with `userApproval: true`.

New documents and chunks are saved as `PENDING_REVIEW` by default.

## Tools

- `list_collections`
- `create_collection`
- `list_documents`
- `search_knowledge_base`
- `propose_source_insert`
- `approve_source_insert`
- `attach_document_file`
- `list_pending_reviews`
- `approve_chunk`
- `reject_chunk`
- `add_feedback`
- `create_eval_case`
- `get_assistant_config`
- `set_assistant_name`
- `get_harness_rules`
- `propose_harness_update`
- `approve_harness_update`
- `approve_harness_rule`
- `reject_harness_rule`

`attach_document_file` refuses to run unless `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are all set. Without them it returns a clear error instead of silently storing anything.

`set_assistant_name` writes directly (no propose/approve step) because it changes configuration, not knowledge content. It is the **only** way to change the read-only chat's display name and identity instructions — the chat app cannot rename itself, and this name is never stored as a `RagDocument`/`RagChunk`, so it can never be retrieved and recited back as "content." See [docs/rag.md](../../docs/rag.md).

`propose_harness_update` / `approve_harness_update` / `approve_harness_rule` / `reject_harness_rule` manage `HarnessRule` rows describing what the chat can/cannot do. This is the most guarded write path in the server — one stage more than knowledge writes — and `propose_harness_update`/`approve_harness_update` both hard-refuse (in code, not just via instructions) any statement that would grant the chat write/delete/approve/bypass/reveal-model powers or try to remove a hardcoded protection. See [docs/mcp-server.md](../../docs/mcp-server.md#harness-rules-propose--approve--review).

## MVP Limits

- Chunking is paragraph-based.
- Embeddings are left null.
- PDF parsing is not included; pass extracted text into the tool.
- Webpage fetching is not included; pass extracted text and `sourceUrl`.
- Original file bytes are not uploaded by this server; `attach_document_file` only records a `storageKey` once storage is configured. Wire your own bucket client in `lib/storage.ts` to perform the actual upload.
