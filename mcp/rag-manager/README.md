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

`attach_document_file` refuses to run unless `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are all set. Without them it returns a clear error instead of silently storing anything.

## MVP Limits

- Chunking is paragraph-based.
- Embeddings are left null.
- PDF parsing is not included; pass extracted text into the tool.
- Webpage fetching is not included; pass extracted text and `sourceUrl`.
- Original file bytes are not uploaded by this server; `attach_document_file` only records a `storageKey` once storage is configured. Wire your own bucket client in `lib/storage.ts` to perform the actual upload.
