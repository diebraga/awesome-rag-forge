# rag-builder-mcp — GitHub Copilot entry point

See `AGENTS.md` first for the project-wide coding note that applies regardless of which assistant is running.

Generic RAG knowledge base builder managed through an MCP server, with a strict split between the two components:

- **Chat app (`app/`)** is a **read-only** viewer for testing retrieval and answering questions from the approved knowledge base. It must never create, edit, approve, reject, archive, or delete anything.
- **MCP server (`mcp/rag-manager`)** is the **only** component authorized to manage the knowledge base, through a propose → human approval → write workflow.

Read [docs/overview.md](../docs/overview.md) and [docs/architecture.md](../docs/architecture.md) for the full picture before making changes.

## Documentation index

Load only what's relevant to your current task:

- [Project Overview](../docs/overview.md) — what this project is and isn't.
- [Repository Structure](../docs/repository-structure.md) — where things live.
- [System Architecture](../docs/architecture.md) — chat path vs. knowledge-management path.
- [Database & Prisma](../docs/database.md) — schema, `db push` workflow, generic fields.
- [RAG Architecture](../docs/rag.md) — chunking, retrieval, review loop, feedback/eval.
- [MCP Server](../docs/mcp-server.md) — tool list, the propose/approve safety rule, client setup.
- [API Routes](../docs/api-routes.md) — `/api/chat`, `/api/rag`.
- [Environment Variables](../docs/environment-variables.md) — required vs. optional vars.
- [Development Workflow](../docs/development-workflow.md) — local setup and everyday scripts.
- [Testing](../docs/testing.md) — `npm test` (Vitest) plus the manual verification checklist.
- [Deployment](../docs/deployment.md) — why the app, MCP server, and database are deployed separately (and why nothing here is deployed for you).
- [Coding Standards](../docs/coding-standards.md) — isolation rules, generic-naming rule, Next.js version caveat.
- [Contributing](../docs/contributing.md) — PR checklist and scope guidelines.
- [Security Considerations](../docs/security.md) — approval gating, no auto-approval, no secret logging, no Prisma in the browser.

## Minimum requirements — check before doing setup/environment work

Full table: [docs/development-workflow.md#prerequisites](../docs/development-workflow.md#prerequisites). Required: Node.js ≥ 20.9, npm, PostgreSQL with the `pgvector` extension (`RagChunk.embedding` is `vector(768)` — `prisma db push` fails without it), Ollama running with a model pulled (chat only), and an MCP client (nothing can be written without one, by design). Optional: an S3-compatible bucket for stored/downloadable files.

If you're setting this project up, debugging a failed `npm run dev`/`npm run build`/`npx prisma db push`, or a user reports something not working and a missing prerequisite could be why:

1. **Check first, don't assume.** `node -v` for Node; try connecting to `DATABASE_URL` and check for the `vector` extension; check Ollama's status.
2. **Tell the user plainly what's missing and why it matters** — don't just fail silently or blame something else.
3. **Attempt to fix what's safely automatable yourself**: `npm install` for missing packages, `CREATE EXTENSION IF NOT EXISTS vector;` if the database is reachable but the extension isn't enabled, running `ollama pull <model>` if Ollama is installed and running but the model isn't. Say what you're about to do before doing it, same as any other command.
4. **Never install system-level software (Node itself, Postgres, Ollama, an MCP client) without asking first** — offer to, but confirm before running it.
5. **Never fabricate, guess, or auto-generate secrets** (`DATABASE_URL`, `STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY`, etc.). These always require the user to obtain them from a real provider and add them to `.env` themselves — point them at [Environment Variables](../docs/environment-variables.md) rather than inventing a placeholder that would fail silently later.

## Non-negotiable rules

- Never add a write path (create, edit, approve, reject, archive, delete) to the chat app (`app/`, `lib/`) beyond the one narrow, explicit exception: `POST /api/feedback`, which can only ever create a `RagFeedback` row (an end user's reaction to an answer). It has no path to `RagChunk`/`RagDocument`/`HarnessRule` and must never gain one — any change that would let it touch those belongs in the MCP server instead, gated the same way every other knowledge write is. Everything else in the chat app reads `APPROVED` data only — see [docs/architecture.md](../docs/architecture.md).
- Never let an MCP write path skip `propose_source_insert` → human approval → `PENDING_REVIEW`. Nothing reaches `APPROVED` without an explicit `approve_chunk` call.
- Never let a harness rule (`HarnessRule`) grant a capability the code doesn't already enforce. Hardcoded identity/read-only rules always render before and win over harness config — see [docs/rag.md](../docs/rag.md#the-harness-capabilities-and-restrictions). Keep `lib/rag/harness.ts`'s hardcoded blocklist; don't replace it with prompt-only guidance.
- Never add or restore domain-specific fields (e.g. legal/medical-only vocabulary) to the shared schema — use `category`/`domain`/`tags`/`metadata`.
- Never deploy, push, or provision hosted infrastructure unless explicitly asked in the moment.

## Connecting this server to GitHub Copilot

See [docs/mcp-server.md](../docs/mcp-server.md) for the MCP client config shape. As with Claude Desktop, `cwd` must point at your local clone of this repo — Copilot does not get a hosted MCP server for free by deploying the app.
