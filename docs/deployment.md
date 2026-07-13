# Deployment

**This project does not include a deploy step, and nothing here should be deployed without deliberate setup.** This document explains the moving parts so you can decide how to deploy them yourself.

## The only thing meant to be deployed publicly: `public-site/`

The full app below — chat, Collections, Harness, `/review`, the MCP server, everything — is local-only by design and stays that way. If you want a public URL at all, it should point at `public-site/index.html`: a single static HTML file, no framework, no build step, no server code, no routes. It fetches this repo's `README.md` live from `raw.githubusercontent.com` (which sends permissive CORS headers, so no proxy is needed) and renders it client-side, so editing docs and pushing to GitHub updates the live page with no redeploy.

Deployable to GitHub Pages directly from the repo, or any static host (Netlify, Cloudflare Pages, S3 + CloudFront, etc.) — point the host at the `public-site/` directory. Because there is no framework and no route table, there is structurally nothing else this deployable could leak: it cannot ship a route, an API handler, or a database credential it doesn't have. That's a stronger guarantee than gating the full app's routes with `ENABLE_TESTING_SURFACE`, achieved by having less code, not by checking harder.

Never add server code, API calls beyond the README fetch, or a build step to `public-site/` — the moment it needs a `package.json` or a route, it stops being the thing that makes this guarantee true. See `docs/superpowers/specs/2026-07-13-public-site-split-design.md` for the full design reasoning.

## Three separate things

1. **The Next.js app** — the chat UI and `/api/chat`, `/api/rag` routes. Deployable to Vercel or any Node host.
2. **The MCP server** (`mcp/rag-manager`) — a local stdio process by default. It is **not** hosted by deploying the Next.js app. An optional, `MCP_AUTH_TOKEN`-authenticated HTTP transport exists (`npm run mcp:rag-manager:http`) for clients that can't spawn a stdio subprocess, but it's still meant to run on a machine you control, bound to `127.0.0.1` by default — see [Security Considerations](security.md#mcp-server-trust-boundary). Normally it only runs on a machine where you (or your MCP client) start it directly.
3. **The database** — any managed Postgres-compatible database (e.g. Prisma Postgres, Supabase, RDS, Neon). Both the app and the MCP server connect to the same `DATABASE_URL`.

## Testing surface is off by default

`.env.example` defaults `ENABLE_TESTING_SURFACE=true` for local project use, but a missing Vercel env var is treated as disabled. With the flag off, the chat, Collections, and Harness pages show a disabled-mode message with instructions, the header omits their links, and the supporting `/api/chat`, `/api/feedback`, `/api/rag*`, and `/api/ollama*` routes return 404 JSON. This lets you deploy the app without accidentally publishing the local testing endpoints. If you intentionally set `ENABLE_TESTING_SURFACE=true` in a deployed environment, also set `APP_API_KEY`; otherwise the pages show setup instructions and the APIs return `503`.

Set `ENABLE_TESTING_SURFACE=true` only for a private/local testing deployment, or after you have added authentication. The MCP server is unaffected by this flag; it remains a separate local process. See [Testing Surface](testing-surface.md).

## Why the model server needs attention

The chat route defaults to `http://127.0.0.1:11434` — your local Ollama instance. That will not resolve on a hosted deployment. Options:

1. Next.js on Vercel + a hosted model API.
2. Next.js on Vercel + a separate GPU model server running Ollama, vLLM, TGI, or similar, reachable over HTTPS.
3. One VPS/GPU server running both Next.js and the model server together.

Whichever you choose, set `OLLAMA_URL` to a reachable HTTPS endpoint in your deployment environment (see [Environment Variables](environment-variables.md)).

## The MCP server stays local (for now)

Because MCP tools can write to your knowledge base, and because this repo does not include an HTTP/remote transport or auth for the MCP server, treat it as a local development and curation tool: run it on your machine, point your MCP client's `cwd` at your local clone, and let it write to the same database your deployed app reads from. If you need remote/multi-user MCP access, you would need to add an authenticated remote transport — that is out of scope for this repo today.

## Do not deploy or push without explicit instruction

Nothing in this repository should be pushed to a remote, deployed, or provisioned automatically by an AI assistant working in this codebase. Deployment and hosted database provisioning are actions with real cost and blast radius — they require an explicit, in-the-moment request from a human.
