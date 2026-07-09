# rag-builder-mcp — Codex entry point

See `AGENTS.md` first for the project-wide coding note that applies regardless of which assistant is running.

Generic RAG knowledge base builder managed through an MCP server, with a strict split between the two components:

- **Chat app (`app/`)** is a **read-only** viewer for testing retrieval and answering questions from the approved knowledge base. It must never create, edit, approve, reject, archive, or delete anything.
- **MCP server (`mcp/rag-manager`)** is the **only** component authorized to manage the knowledge base, through a propose → human approval → write workflow.

Read [docs/overview.md](docs/overview.md) and [docs/architecture.md](docs/architecture.md) for the full picture before making changes.

## Documentation index

Load only what's relevant to your current task:

- [Project Overview](docs/overview.md) — what this project is and isn't.
- [Repository Structure](docs/repository-structure.md) — where things live.
- [System Architecture](docs/architecture.md) — chat path vs. knowledge-management path.
- [Database & Prisma](docs/database.md) — schema, `db push` workflow, generic fields.
- [RAG Architecture](docs/rag.md) — chunking, retrieval, review loop, feedback/eval.
- [MCP Server](docs/mcp-server.md) — tool list, the propose/approve safety rule, client setup.
- [API Routes](docs/api-routes.md) — `/api/chat`, `/api/rag`.
- [Environment Variables](docs/environment-variables.md) — required vs. optional vars.
- [Development Workflow](docs/development-workflow.md) — local setup and everyday scripts.
- [Testing](docs/testing.md) — manual verification checklist (no automated suite yet).
- [Deployment](docs/deployment.md) — why the app, MCP server, and database are deployed separately (and why nothing here is deployed for you).
- [Coding Standards](docs/coding-standards.md) — isolation rules, generic-naming rule, Next.js version caveat.
- [Contributing](docs/contributing.md) — PR checklist and scope guidelines.
- [Security Considerations](docs/security.md) — approval gating, no auto-approval, no secret logging, no Prisma in the browser.

## Non-negotiable rules

- Never add a write path (create, edit, approve, reject, archive, delete) to the chat app (`app/`, `lib/`). It reads `APPROVED` data only — see [docs/architecture.md](docs/architecture.md).
- Never let an MCP write path skip `propose_source_insert` → human approval → `PENDING_REVIEW`. Nothing reaches `APPROVED` without an explicit `approve_chunk` call.
- Never let a harness rule (`HarnessRule`) grant a capability the code doesn't already enforce. Hardcoded identity/read-only rules always render before and win over harness config — see [docs/rag.md](docs/rag.md#the-harness-capabilities-and-restrictions). Keep `lib/rag/harness.ts`'s hardcoded blocklist; don't replace it with prompt-only guidance.
- Never add or restore domain-specific fields (e.g. legal/medical-only vocabulary) to the shared schema — use `category`/`domain`/`tags`/`metadata`.
- Never deploy, push, or provision hosted infrastructure unless explicitly asked in the moment.

## Connecting this server to Codex

See [docs/mcp-server.md](docs/mcp-server.md) for the MCP client config shape. As with Claude Desktop, `cwd` must point at your local clone of this repo — Codex does not get a hosted MCP server for free by deploying the app.
