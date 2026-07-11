# API Routes

Every route below is part of the web testing surface and is enabled only when `ENABLE_TESTING_SURFACE=true`. When the flag is missing or false, the pages show a disabled-mode message and these API routes return `404` JSON before doing any work. See [Testing Surface](testing-surface.md).

Every route below is **read-only** except `POST /api/feedback`, which is a single, deliberately narrow exception — it can create a `RagFeedback` row and nothing else. See [System Architecture](architecture.md) for the enforced read/write boundary and why that one route exists.

## Shared readiness and authentication

All testing API routes check the same shared gate before route-specific work runs: database configured/connected, `ENABLE_TESTING_SURFACE=true`, then `APP_API_KEY` if required. Local clones can leave `APP_API_KEY` blank. If it is set, callers must send `Authorization: Bearer <key>`. If Vercel has `ENABLE_TESTING_SURFACE=true` but no `APP_API_KEY`, the routes return `503` with `reason: "missing-api-key"`. If a configured key is missing or wrong, routes return `401` with `reason: "invalid-api-key"`. The default local stdio MCP server does not use this web API key.

## API docs and OpenAPI spec: `/api-docs`, `/api-docs/openapi.json`

Every route on this page is described in a generated OpenAPI 3.0 spec, viewable as interactive Swagger UI at `/api-docs` and downloadable directly at `/api-docs/openapi.json` once the testing surface is enabled and the database is connected. The point is external, framework-agnostic integration: feed the downloaded spec into [openapi-generator](https://openapi-generator.tech) to get a working client in any language, without depending on this project's own stack.

**Generated, not hand-maintained.** `scripts/generate-openapi.ts` scans every `app/api/**/route.ts` file for a `@swagger` JSDoc comment and assembles the spec at build time (`npm run generate:openapi`, wired into `prebuild` so it runs automatically before every `npm run build`). Adding a new endpoint means adding its own `@swagger` block to its route file — see any existing route for the pattern — then rebuilding (or running the script directly for a quick check). There is no separate spec file to keep in sync by hand.

**Generated at build time on purpose, not per-request:** an API route that scanned source files for `@swagger` comments on every request would be fragile on serverless platforms like Vercel, whose file tracing only bundles files actually imported at runtime, not arbitrary source read via `fs`/glob. Writing `app/api-docs/openapi.generated.json` at build time sidesteps that; the gated `/api-docs/openapi.json` route imports the generated artifact instead of scanning source at runtime.

**`/api-docs` is part of the testing surface.** It renders only when `DATABASE_URL` is configured and reachable and `ENABLE_TESTING_SURFACE=true`; otherwise it shows the same setup/disabled instructions as the rest of the testing UI. The spec contains schema only, never live data.

## `POST /api/chat`

Accepts chat history and returns a model reply.

Request body:

```json
{ "messages": [{ "role": "user", "text": "..." }], "model": "llama3.1:8b" }
```

`model` is optional and validated against the active `ChatProvider`'s own allowlist (`lib/chat-providers/`; for the default Ollama provider, that's `AVAILABLE_MODELS` in `lib/ollama.ts`) — an unrecognized value silently falls back to the provider's default model, it's never passed through unchecked.

Behavior:

1. Calls `buildAssistantContext()` from [`lib/rag/chat-context.ts`](../lib/rag/chat-context.ts) to get the assistant's identity/read-only/harness system prompt, knowledge-base scope stats, retrieved RAG context, and structured citations.
2. Calls `getChatProvider().chat(...)` (`lib/chat-providers/index.ts`) with that system prompt and the requested (or default) model. The route itself is provider-agnostic — it doesn't know or care whether the reply came from Ollama or something else; see [System Architecture](architecture.md) and the README's "LLM provider" section for the abstraction. `CHAT_PROVIDER` (env var, defaults to `ollama`) selects which provider runs.
3. Returns `{ reply, model, sources }` — `model` here is the assistant's configured **name** (e.g. `"Archivist"`), never the underlying model/provider string, so the real backend is not leaked through the API response either. `sources` is the deduped list of `APPROVED` documents whose chunks were retrieved for this request: `[{ documentId, title, downloadable }]`. `downloadable` is `true` only when the document has a stored original file — the UI uses it to decide whether to render a download link, and it's the only place a `storageKey` value's *existence* is exposed (the key itself never is). See `GET /api/rag/documents/[id]/download` below.

Error handling: each `ChatProvider.chat()` call returns a structured `{ ok: false, status, error }` result instead of throwing for expected failure modes — for the default Ollama provider, that's a `502` with a clear message when the model isn't pulled, and a `503` telling the user to reconnect if Ollama isn't reachable, rather than a raw fetch exception reaching the client. See `app/api/chat/route.ts` and `lib/chat-providers/ollama.ts`.

## `GET /api/rag`

Lightweight debug/inspection endpoint. Returns the same RAG context array and citations the chat route would use:

```json
{ "ok": true, "count": 2, "context": ["Source 1: ...", "Source 2: ..."], "citations": [{ "documentId": "...", "title": "...", "downloadable": true }] }
```

Useful for verifying that seeded or newly approved chunks are actually retrievable without going through the full chat flow.

See `app/api/rag/route.ts`.

## `GET /api/rag/documents/[id]/download`

Read-only. Redirects (`307`) to a short-lived (5 minute) presigned URL for a document's original stored file. If called with `?format=json`, returns `{ "ok": true, "url": "..." }` instead so the browser UI can attach its API key to this route and then open the presigned URL normally. Requires the document to be `status: APPROVED` **and** have a non-null `storageKey` — anything else (not found, still `PENDING_REVIEW`, or no file was ever attached) returns `404`:

```json
{ "ok": false, "error": "No downloadable file found for this document." }
```

Bytes are never proxied through the Node process — the redirect target is the storage provider itself, via `getDownloadUrl()` in [`lib/storage.ts`](../lib/storage.ts). This keeps the bucket private (no public-read bucket policy needed) while still staying entirely read-only: the route only ever reads an already-`APPROVED` document's already-set `storageKey`, the same visibility rule as every other route in this file. See `app/api/rag/documents/[id]/download/route.ts`.

## `GET /api/rag/context`

Advanced integration endpoint. It returns the end-user-facing context bundle that `/api/chat` uses internally, for a trusted external chat client that needs to reproduce the same behavior without importing this project's code:

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

`capabilities`/`restrictions` are only ever `APPROVED` `HarnessRule` rows — see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions). An external chat client can fetch this endpoint, use `systemPrompt` (or assemble its own from `name`/`stats`/`capabilities`/`restrictions`/`ragContext`) as its own system prompt, and inherit the same identity, approved harness rules, and read-only posture as the local chat without importing Prisma or this codebase. It is not a creator/admin endpoint: drafts, rejected records, feedback queues, eval creation, and all review workflows remain MCP-only.

**This is the chat's context, not the knowledge base creator's.** `stats` (counts/categories/domains/tags) exists for the model's own internal calibration only — `systemPrompt` explicitly instructs it never to recite these figures or describe its own structure to the end user. If you're building the knowledge base and need to see actual collection/document names, connect an MCP client to `mcp/rag-manager` instead (see [MCP Server](mcp-server.md)) — that's the creator-facing surface, with full structural visibility on purpose.

This endpoint uses the same shared testing API gate as the rest of the web surface: local clones can leave `APP_API_KEY` blank, but if a key is configured the caller must send `Authorization: Bearer <key>`.

See `app/api/rag/context/route.ts`.

## `GET /api/rag/collections`

Read-only, `APPROVED`-only list of collections for the [Collections page](#the-collections-pages) — one entry per collection that has at least one `APPROVED` document:

```json
{
  "ok": true,
  "collections": [
    {
      "id": "rag_collection_sample",
      "name": "Awesome RAG Forge Documentation",
      "description": "Sample collection...",
      "category": "documentation",
      "domain": "product",
      "tags": ["seed", "docs"],
      "approvedDocumentCount": 1,
      "approvedChunkCount": 3
    }
  ]
}
```

`approvedChunkCount` is a rough "how much is actually in here" signal, since a document can be `APPROVED` while some of its chunks aren't.

See `lib/rag/collections.ts` and `app/api/rag/collections/route.ts`.

## `GET /api/rag/collections/[collectionId]`

Read-only, `APPROVED`-only, paginated detail for one collection — its documents and each document's `APPROVED` chunks. Query params: `page` (default `1`), `pageSize` (default `10`, max `50`).

```json
{
  "ok": true,
  "collection": { "id": "...", "name": "...", "description": "...", "category": "...", "domain": "...", "tags": [] },
  "documents": [
    { "id": "...", "title": "...", "category": "...", "domain": "...", "tags": [], "sourceType": "MARKDOWN", "chunks": [{ "id": "...", "chunkText": "...", "sectionTitle": "...", "chunkIndex": 0 }] }
  ],
  "page": 1,
  "pageSize": 10,
  "totalDocuments": 1,
  "totalPages": 1
}
```

Returns `404` if the collection doesn't exist. See `lib/rag/collections.ts` and `app/api/rag/collections/[collectionId]/route.ts`.

### The Collections pages

`app/collections/page.tsx` (a plain list) and `app/collections/[collectionId]/page.tsx` (paginated documents, expandable to their chunks) are part of the same read-only, end-user-facing surface as the chat — same `APPROVED`-only visibility, no write path. Showing collection/document names here is a **deliberate, explicit feature**, not a contradiction of the chat's restriction against narrating its own structure in conversation: that restriction governs the chat's natural-language behavior (`lib/rag/chat-context.ts`), not this dedicated browsing view. See [System Architecture](architecture.md#two-audiences-kept-apart-on-purpose) and [Security Considerations](security.md).

There is intentionally no graph/visualization layer here — an earlier version rendered collections as a node graph (`@xyflow/react`), but with a small number of collections a plain list is clearer and has no dependency to maintain. If the knowledge base grows enough that a visual overview becomes useful again, revisit that decision rather than assuming a list won't scale.

## `GET /api/rag/harness`

Read-only testing endpoint: the chat's identity and its `APPROVED` capabilities/restrictions, without the retrieval call `GET /api/rag/context` also makes — backs the [Harness page](#the-harness-page). This is display-only; harness proposal, approval, rejection, and review stay MCP-only.

```json
{
  "ok": true,
  "name": "Archivist",
  "instructions": null,
  "capabilities": ["Search and answer questions using the approved knowledge base.", "..."],
  "restrictions": ["Cannot create, edit, approve, reject, archive, or delete knowledge.", "..."]
}
```

See `lib/rag/chat-context.ts` (`getAssistantConfig`), `lib/rag/harness.ts` (`getApprovedHarnessRules`), and `app/api/rag/harness/route.ts`.

### The Harness page

`app/harness/page.tsx` shows the same identity and `APPROVED` capabilities/restrictions that are baked into the chat's system prompt — as a simple list, since there's nothing structural to visualize here. Same audience and visibility rules as the chat and the Collections pages: read-only, `APPROVED`-only. Changing any of this only ever happens through the MCP server's `propose_harness_update` → `approve_harness_update` → `approve_harness_rule`/`reject_harness_rule` flow (see [MCP Server](mcp-server.md#harness-rules-propose--approve--review)) — nothing on this page is editable.

## `GET /api/ollama/status`

Checks whether Ollama is reachable at `OLLAMA_URL` and, if so, which models are actually pulled. Used by the chat UI to show a connection indicator, populate the model dropdown, and gate the message input until the selected model is both installed and the server is reachable.

```json
{
  "ok": true,
  "running": true,
  "installedModels": ["qwen2.5:7b-instruct"],
  "availableModels": ["qwen2.5:7b-instruct", "llama3.1:8b", "mistral:7b-instruct", "gemma2:9b", "phi3.5"],
  "canAutoStart": true
}
```

`availableModels` is the fixed curated list from `lib/ollama.ts` (`AVAILABLE_MODELS`) — always includes `OLLAMA_MODEL` plus four general-purpose models to try. `installedModels` is whatever Ollama actually reports as pulled right now; the difference between the two drives the "Download model" button. `canAutoStart` reflects whether `POST /api/ollama/start` and `POST /api/ollama/pull` are allowed to do anything in this environment — see below.

## `POST /api/ollama/pull`

Streams a model download straight from Ollama's own `/api/pull` through to the client, so the UI can show real progress instead of a blind spinner for what can be a multi-gigabyte download.

Request body:

```json
{ "model": "llama3.1:8b" }
```

`model` must be one of `AVAILABLE_MODELS` — an unrecognized name is refused with a `400`, never forwarded to Ollama. Gated by the same `canAutoStartOllama()` check as `/api/ollama/start` (local `OLLAMA_URL`, non-production) — a deployed instance must never let a visitor's request trigger a large download on the host. The response body is Ollama's newline-delimited JSON progress stream, passed through unmodified; the client parses `completed`/`total` byte counts out of it to render a percentage. See `lib/ollama.ts` and `app/api/ollama/pull/route.ts`.

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

## `POST /api/feedback`

Records a thumbs up/down reaction to a chat answer. The **only** database write anywhere in `app/` — see [Security Considerations](security.md#post-apifeedback--the-one-narrow-write-path-in-the-chat-app-scoped-on-purpose) for why it's safe to be an exception and what stops it from becoming a bigger one. Feedback review, feedback resolution, eval creation, and any follow-up knowledge/harness changes stay MCP-only.

Request body:

```json
{ "question": "What does this project do?", "answer": "...", "rating": "GOOD", "documentIds": ["doc_abc123"] }
```

- `rating` must be `"GOOD"` or `"BAD"` — anything else is refused with a `400`. This is a subset of the full `RagFeedbackRating` enum (`GOOD`/`BAD`/`INCOMPLETE`/`UNSAFE`/`OUTDATED`); the chat UI only ever exposes two reactions, so this route only ever accepts those two.
- `question`/`answer` are optional but expected from the chat UI; both are truncated to a bounded length before storage.
- `documentIds` is optional — the chat UI passes the `documentId`s of any cited sources (from the reply's `sources` array), stored in `RagFeedback.metadata.citedDocumentIds` for context, capped at 10 entries.
- Writes a `RagFeedback` row and returns `{ ok: true, id }`. This is the **only** table this route can write to — it has no code path to `RagChunk`/`RagDocument`/`RagCollection`/`HarnessRule`.

See `app/api/feedback/route.ts`.

## No knowledge-base write endpoints

`POST /api/ollama/start` and `POST /api/feedback` are the two `POST` routes in `app/` that do anything beyond reading. Neither writes knowledge: `/api/ollama/start` only ever attempts to launch a local process, never touches Prisma; `/api/feedback` only ever creates a `RagFeedback` row, an end-user reaction to an already-approved answer, not a change to what the assistant knows or does. There is intentionally no endpoint that writes actual knowledge over HTTP, and there never should be. The chat app is a retrieval viewer, plus this one narrow feedback-capture exception — it does not manage the knowledge base. All knowledge writes go through the MCP server's approval-gated tools — see [MCP Server](mcp-server.md).
