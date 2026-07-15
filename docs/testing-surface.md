# Testing Surface

`DATABASE_URL` is checked before testing mode. If the database connection string is missing, empty, or still set to a placeholder, the app shows database setup instructions first and the API routes return a configuration error. If the value exists but the connection fails, the app shows a database connection error before testing mode is evaluated. After that, `ENABLE_TESTING_SURFACE` controls whether the Next.js testing UI and its supporting API routes are exposed. The template `.env.example` sets it to `true` for local project use, and this developer checkout should keep it true. A missing or unset value is still treated as disabled, so a Vercel or public deployment with no extra env var will not expose the chat, collections browser, harness viewer, feedback capture, RAG context/debug endpoints, document download route, or Ollama helper routes.

## What the flag controls

When `ENABLE_TESTING_SURFACE=true`, the Next.js app exposes the local testing surface:

- `GET /` — chat UI for testing approved retrieval.
- `GET /collections` and `GET /collections/[collectionId]` — approved collection browsing; the detail page can locally soft-archive already-visible approved documents/chunks after warning and reason.
- `GET /harness` — read-only approved assistant identity/capability/restriction view.
- `/api/chat` — chat reply generation.
- `/api/feedback` — the narrow feedback capture route that only creates `RagFeedback`.
- `/api/rag`, `/api/rag/context`, `/api/rag/harness`, `/api/rag/collections*`, `/api/rag/documents/[id]/download` — read-only testing/debug/read HTTP surfaces.
- `/api/ollama/status`, `/api/ollama/start`, `/api/ollama/pull` — local model helper endpoints.

When the flag is missing or set to anything other than exactly `true`:

- Testing pages render a disabled-mode message with instructions for turning the surface on.
- Header navigation omits the testing links.
- Testing API routes return `404` JSON with a disabled-surface error.
- The MCP server is unaffected. RAG and harness management through MCP still works according to the normal MCP approval rules.

## Why this exists

This project is intended to be useful locally first. The chat, collections, and harness pages are testing/development surfaces, not a hardened public product surface. The local template defaults on so a downloaded clone works naturally, but deployed/public instances should only expose the surface after you explicitly set `ENABLE_TESTING_SURFACE=true`.

This flag is the outer exposure switch, not the whole authorization story. The enabled testing API routes also use `APP_API_KEY` when it is configured. Local clones may leave `APP_API_KEY` blank for frictionless use. On Vercel, if an operator explicitly sets `ENABLE_TESTING_SURFACE=true` but forgets `APP_API_KEY`, the pages show an API-key setup screen and the supporting API routes return `503` instead of opening publicly.

**The local-true default is a deliberate, reviewed choice, not an oversight.** Env vars are trusted, operator-controlled values, not attacker-controlled ones — each deployment target (Vercel, another host, etc.) has its own separate environment configuration that does not inherit from this repo's `.env.example`. Exposing the testing surface anywhere other than a local dev checkout always requires a human to deliberately go into that specific server/project's environment settings and add `ENABLE_TESTING_SURFACE=true` themselves — it can never happen by silently copying this template file. That's why defaulting to `true` here is safe: it optimizes for "a downloaded clone works immediately," while every real deployment target starts closed unless someone explicitly opts it in, in that environment, on purpose.

## Local and deployed defaults

For a local developer who wants to use the web testing UI, keep or add this in `.env`:

```env
ENABLE_TESTING_SURFACE=true
```

For Vercel or any public deployment, omit the variable or set it explicitly to `false` unless you intentionally want the testing UI online:

```env
ENABLE_TESTING_SURFACE=false
```

If you do enable it in a deployed environment, set a strong API key too:

```env
ENABLE_TESTING_SURFACE=true
APP_API_KEY="use-a-long-random-secret"
```

The browser UI never receives this secret from the server. When a protected request returns `401`, the UI asks the user to enter the same key and stores it in that browser's localStorage, then sends it as `Authorization: Bearer <key>`.

Do not infer this flag from `NODE_ENV`. A production build can still be used privately, and a development server can still be exposed accidentally. The explicit env var is the source of truth.

## For AI assistants

Before exposing or debugging any route under `app/` or `app/api/`, check this flag. If a user says the deployed app shows the disabled testing-mode message, first verify whether `ENABLE_TESTING_SURFACE=true` is set in that environment.

Do not remove this guard to make a route work in deployment. Either tell the user to enable the flag intentionally and configure `APP_API_KEY`, or keep the testing surface disabled. Do not add an MCP API key to the default stdio MCP flow; it remains local/offline.
