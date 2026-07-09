# API Routes

Both routes below are **read-only**. Neither one, nor anything else in `app/`, writes to the database. See [System Architecture](architecture.md) for the enforced read/write boundary.

## `POST /api/chat`

Accepts chat history and returns a model reply.

Request body:

```json
{ "messages": [{ "role": "user", "text": "..." }] }
```

Behavior:

1. Calls `buildAssistantContext()` from [`lib/rag/chat-context.ts`](../lib/rag/chat-context.ts) to get the assistant's identity/read-only/harness system prompt, knowledge-base scope stats, and retrieved RAG context.
2. Calls Ollama's `/api/chat` with `stream: false`, using that system prompt.
3. Returns `{ reply, model }` — `model` here is the assistant's configured **name** (e.g. `"Archivist"`), never the underlying model/provider string, so the real backend is not leaked through the API response either.

See `app/api/chat/route.ts`.

## `GET /api/rag`

Lightweight debug/inspection endpoint. Returns the same RAG context array the chat route would use:

```json
{ "ok": true, "count": 2, "context": ["Source 1: ...", "Source 2: ..."] }
```

Useful for verifying that seeded or newly approved chunks are actually retrievable without going through the full chat flow.

See `app/api/rag/route.ts`.

## `GET /api/rag/context`

The full "RAG awareness" bundle — the same thing `/api/chat` uses internally — exposed for **any external agent** you want to connect later (a different LLM provider, a different app, a bot):

```json
{
  "ok": true,
  "name": "Archivist",
  "stats": {
    "collectionCount": 1,
    "documentCount": 1,
    "approvedChunkCount": 3,
    "categories": ["documentation"],
    "domains": ["product"],
    "tags": ["seed", "docs"]
  },
  "capabilities": [
    "Search and answer questions using the approved knowledge base.",
    "Cite sources for retrieved information when available."
  ],
  "restrictions": [
    "Cannot create, edit, approve, reject, archive, or delete knowledge.",
    "Cannot reveal the underlying model, provider, or version.",
    "Cannot perform any action outside retrieval and answering questions.",
    "Cannot describe its own internal structure — collection names, categories, tags, or document counts — even if asked directly. Can only answer using retrieved content."
  ],
  "ragContext": ["Source 1: ...", "..."],
  "systemPrompt": "You are Archivist.\n\n..."
}
```

`capabilities`/`restrictions` are only ever `APPROVED` `HarnessRule` rows — see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions). An external agent can fetch this endpoint, use `systemPrompt` (or assemble its own from `name`/`stats`/`capabilities`/`restrictions`/`ragContext`) as its own system prompt, and it will inherit the same identity, harness rules, and read-only posture as the local chat — without ever touching Prisma or the database directly.

**This is the chat's context, not the knowledge base creator's.** `stats` (counts/categories/domains/tags) exists for the model's own internal calibration only — `systemPrompt` explicitly instructs it never to recite these figures or describe its own structure to the end user. If you're building the knowledge base and need to see actual collection/document names, connect an MCP client to `mcp/rag-manager` instead (see [MCP Server](mcp-server.md)) — that's the creator-facing surface, with full structural visibility on purpose.

**No authentication is applied yet.** This is intentional for local/MVP use (see [Security Considerations](security.md)); add an API key or similar before exposing this beyond your own machine.

See `app/api/rag/context/route.ts`.

## `GET /api/ollama/status`

Checks whether Ollama is reachable at `OLLAMA_URL` and whether the configured `OLLAMA_MODEL` is pulled. Used by the chat UI to show a connection indicator and to gate the message input until a model is actually available.

```json
{
  "ok": true,
  "running": true,
  "modelAvailable": true,
  "modelName": "qwen2.5:7b-instruct",
  "availableModels": ["qwen2.5:7b-instruct"],
  "canAutoStart": true
}
```

`canAutoStart` reflects whether `POST /api/ollama/start` is allowed to do anything in this environment — see below.

## `POST /api/ollama/start`

Attempts to launch `ollama serve` **on the machine this Next.js server process is already running on** — nothing else. This is the "Connect to Ollama" button's backend.

It only ever does something when both are true:

- `OLLAMA_URL` resolves to `localhost`/`127.0.0.1`/`::1`.
- `NODE_ENV !== "production"`.

Otherwise it refuses with a 400 and does not spawn anything:

```json
{ "ok": false, "error": "Starting Ollama automatically is only available for a local OLLAMA_URL outside production." }
```

This is deliberate: a production deployment must never let a visitor's browser request trigger process execution on the host server, even if `OLLAMA_URL` were accidentally misconfigured to point at localhost. Both conditions are checked in `lib/ollama.ts` (`canAutoStartOllama()`), not just one, as defense in depth. See [Security Considerations](security.md).

If Ollama isn't installed, the underlying `ollama` binary lookup fails and this returns a clear error (`"Ollama is not installed on this machine..."`) instead of a generic failure. See `lib/ollama.ts` and `app/api/ollama/start/route.ts`.

## No knowledge-base write endpoints

`POST /api/ollama/start` is the one `POST` route in `app/`, and it does not touch the database or the knowledge base at all — it only ever attempts to launch a local process on the machine it's already running on, and only in local dev. There is intentionally no endpoint that writes knowledge over HTTP, and there never should be. The chat app is a retrieval viewer only — it exists to test that retrieval works and to demonstrate the current knowledge base, not to manage it. All knowledge writes go through the MCP server's approval-gated tools — see [MCP Server](mcp-server.md).
