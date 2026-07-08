# System Architecture

## Chat path (read side)

```text
Browser chat UI (app/page.tsx)
        ↓
Next.js API route (app/api/chat/route.ts)
        ↓                              ↓
Ollama local model server       lib/rag.ts (approved chunks only)
        ↓
Response rendered in the chat UI
```

The chat route fetches approved RAG context via `lib/rag.ts`, injects it into the system prompt, and calls Ollama's `/api/chat` endpoint. Only chunks and documents with `status: APPROVED` are ever used here.

## Knowledge management path (write side)

```text
MCP client (Claude Desktop, Codex, etc.)
        ↓
mcp/rag-manager/server.ts  (stdio MCP server)
        ↓
Prisma (mcp/rag-manager/prisma.ts)
        ↓
Postgres (RagCollection, RagDocument, RagChunk, RagSource, RagReview, RagFeedback, RagEvalCase)
```

The MCP server is the only place new knowledge is proposed and written. It never writes without an explicit approval step — see [MCP Server](mcp-server.md).

## Data flow summary

1. A user (via an MCP client) asks the assistant to add a source.
2. The assistant calls `propose_source_insert`, which returns a proposal without touching the database.
3. The user reviews the proposal and approves it.
4. The assistant calls `approve_source_insert` with `userApproval: true`, which creates a document and chunks with `status: PENDING_REVIEW`.
5. A human reviewer calls `approve_chunk` (or `reject_chunk`) via the assistant.
6. Approved chunks become visible to the chat app's RAG context on the next chat request.

## Two separate Prisma clients

- `lib/prisma.ts` — used by the Next.js app (server components/routes only, never in browser code).
- `mcp/rag-manager/prisma.ts` — used by the MCP server process.

Both point at the same `DATABASE_URL` and the same generated Prisma client (`generated/prisma`), but they run in separate processes.

See also: [Database & Prisma](database.md), [RAG Architecture](rag.md), [API Routes](api-routes.md).
