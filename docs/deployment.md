# Deployment

**This project does not include a deploy step, and nothing here should be deployed without deliberate setup.** This document explains the moving parts so you can decide how to deploy them yourself.

## Three separate things

1. **The Next.js app** — the chat UI and `/api/chat`, `/api/rag` routes. Deployable to Vercel or any Node host.
2. **The MCP server** (`mcp/rag-manager`) — a local stdio process. It is **not** hosted by deploying the Next.js app. There is no HTTP transport configured for it in this repo. It only runs on a machine where you (or your MCP client) start it directly.
3. **The database** — any managed Postgres-compatible database (e.g. Prisma Postgres, Supabase, RDS, Neon). Both the app and the MCP server connect to the same `DATABASE_URL`.

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
