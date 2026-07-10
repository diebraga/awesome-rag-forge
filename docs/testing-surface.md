# Testing Surface

`ENABLE_TESTING_SURFACE` controls whether the Next.js testing UI and its supporting API routes are exposed. It defaults to disabled (`false`) in `.env.example`, and an unset value is treated as disabled. This is deliberate: a Vercel or public deployment with no extra env var should not expose the chat, collections browser, harness viewer, feedback capture, RAG context/debug endpoints, document download route, or Ollama helper routes.

## What the flag controls

When `ENABLE_TESTING_SURFACE=true`, the Next.js app exposes the local testing surface:

- `GET /` — chat UI for testing approved retrieval.
- `GET /collections` and `GET /collections/[collectionId]` — read-only approved collection browsing.
- `GET /harness` — read-only approved assistant identity/capability/restriction view.
- `/api/chat` — chat reply generation.
- `/api/feedback` — the narrow feedback capture route that only creates `RagFeedback`.
- `/api/rag`, `/api/rag/context`, `/api/rag/harness`, `/api/rag/collections*`, `/api/rag/documents/[id]/download` — read-only testing/debug/read surfaces.
- `/api/ollama/status`, `/api/ollama/start`, `/api/ollama/pull` — local model helper endpoints.

When the flag is missing or set to anything other than exactly `true`:

- Testing pages call `notFound()` and render as 404 pages.
- Header navigation omits the testing links.
- Testing API routes return `404` JSON with a disabled-surface error.
- The MCP server is unaffected. RAG and harness management through MCP still works according to the normal MCP approval rules.

## Why this exists

This project is intended to be useful locally first. The chat, collections, and harness pages are testing/development surfaces, not a hardened public product surface. Until authentication exists, deployed/public instances should keep `ENABLE_TESTING_SURFACE=false`.

This flag is not an authorization system. It is a coarse exposure switch so accidental deployments do not publish the local testing UI and endpoints. Once authentication is added, keep this flag as the outer deployment switch and put auth checks inside the enabled routes.

## Local and deployed defaults

For a local developer who wants to use the web testing UI, set this in `.env`:

```env
ENABLE_TESTING_SURFACE=true
```

For Vercel or any public deployment, omit the variable or set it explicitly to `false` until authentication is ready:

```env
ENABLE_TESTING_SURFACE=false
```

Do not infer this flag from `NODE_ENV`. A production build can still be used privately, and a development server can still be exposed accidentally. The explicit env var is the source of truth.

## For AI assistants

Before exposing or debugging any route under `app/` or `app/api/`, check this flag. If a user says the deployed app shows 404 for the chat, collections, harness, RAG context, feedback, or Ollama endpoints, first verify whether `ENABLE_TESTING_SURFACE=true` is set in that environment.

Do not remove this guard to make a route work in deployment. Either tell the user to enable the flag intentionally, or, for public use, implement authentication first.
