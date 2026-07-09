# Repository Structure

```text
app/
  page.tsx                Chat UI (client component)
  layout.tsx              Root layout and page metadata
  api/chat/route.ts        Chat endpoint: calls Ollama with the full assistant context
  api/rag/route.ts         Debug endpoint: returns the current approved RAG context
  api/rag/context/route.ts  Full awareness bundle for external agents (identity, harness, stats, context)
  api/ollama/status/route.ts Checks whether Ollama is reachable and the model is pulled
  api/ollama/start/route.ts  Local-only: starts Ollama for the "Connect" button

components/ui/           shadcn UI primitives (Button, Input, Avatar, ScrollArea, Separator)
components.json           shadcn configuration

lib/
  rag/                    Centralized RAG + harness domain logic (separate from generic infra below)
    retrieval.ts           getRagContext() — approved-chunk text search, read-only
    context.ts              buildAssistantContext() — the shared, model-agnostic awareness bundle
    harness.ts               Harness rule validation, proposal building, prompt rendering
  prisma.ts               Prisma client for the Next.js app (server-only)
  storage.ts               Gates document-attachment features behind storage env vars
  ollama.ts                 Ollama connection config + local-only auto-start logic
  utils.ts                   shadcn class-name helper

mcp/
  rag-manager/            Isolated MCP server for managing the knowledge base and harness
    server.ts               Tool registrations (list, propose, approve, review, feedback, eval, harness)
    proposal.ts              Builds and validates source-insert proposals
    chunking.ts               Paragraph-based MVP chunking
    prisma.ts                 Prisma client for the MCP server (separate from lib/prisma.ts)
    README.md                  MCP-specific usage notes

prisma/
  schema.prisma           Generic RAG + harness schema (collections, documents, chunks, sources,
                           reviews, feedback, eval cases, assistant config, harness rules)
  seed.ts                  Seeds a sample collection, default assistant name, and default harness rules

docs/                     Modular documentation (this directory)
CLAUDE.md                 Entry point for Claude Code sessions
CODEX.md                  Entry point for Codex sessions
AGENTS.md                 Project-specific coding notes shared by both assistants
README.md                 Human-facing quick start
.env.example              Documented environment variables (no secrets)
```

## Why `lib/rag/` is its own folder

RAG and harness logic is centralized under `lib/rag/`, separate from generic app infrastructure (`lib/prisma.ts`, `lib/storage.ts`, `lib/ollama.ts`, `lib/utils.ts`, none of which are RAG-specific). `lib/rag/harness.ts` in particular is imported by both the Next.js app (read side) and the MCP server (write side, via a relative import) so validation rules can't drift between them. See [System Architecture](architecture.md#lib-rag--where-all-rag-and-harness-logic-lives).

## Why the MCP server is separate from the app

`mcp/rag-manager` is not imported by the Next.js app and does not run inside it. It is a standalone process, started with `npm run mcp:rag-manager`, that an MCP client (Claude Desktop, Codex, etc.) launches and talks to over stdio. This keeps the Prisma client used by MCP tools isolated from anything that could end up in a browser bundle, and lets you add more MCP servers later under `mcp/<name>/` without touching the app.

See [MCP Server](mcp-server.md) for details.
