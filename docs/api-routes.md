# API Routes

## `POST /api/chat`

Accepts chat history and returns a model reply.

Request body:

```json
{ "messages": [{ "role": "user", "text": "..." }] }
```

Behavior:

1. Fetches approved RAG context via `lib/rag.ts`.
2. Builds a system prompt (generic assistant framing, no domain-specific rules) with the RAG context appended when non-empty.
3. Calls Ollama's `/api/chat` with `stream: false`.
4. Returns `{ reply, model }` or a `{ error }` with an appropriate status code.

See `app/api/chat/route.ts`.

## `GET /api/rag`

Debug/inspection endpoint. Returns the same RAG context array the chat route would use:

```json
{ "ok": true, "count": 2, "context": ["Source 1: ...", "Source 2: ..."] }
```

Useful for verifying that seeded or newly approved chunks are actually retrievable without going through the full chat flow.

See `app/api/rag/route.ts`.

## No other HTTP write endpoints

There is intentionally no `POST` endpoint for writing knowledge over HTTP. All writes go through the MCP server's approval-gated tools — see [MCP Server](mcp-server.md).
