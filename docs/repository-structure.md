# Repository Structure

```text
app/
  page.tsx              Chat UI (client component)
  layout.tsx            Root layout and page metadata
  api/chat/route.ts      Chat endpoint: calls Ollama with approved RAG context
  api/rag/route.ts       Debug endpoint: returns the current approved RAG context

components/ui/           shadcn UI primitives (Card, Button, Input, Avatar, ScrollArea, Separator)
components.json           shadcn configuration

lib/
  prisma.ts              Prisma client for the Next.js app (server-only)
  rag.ts                 Builds RAG context strings from approved chunks
  storage.ts             Gates document-attachment features behind storage env vars
  utils.ts               shadcn class-name helper

mcp/
  rag-manager/           Isolated MCP server for managing the knowledge base
    server.ts             Tool registrations (list, propose, approve, review, feedback, eval)
    proposal.ts            Builds and validates source-insert proposals
    chunking.ts             Paragraph-based MVP chunking
    prisma.ts               Prisma client for the MCP server (separate from lib/prisma.ts)
    README.md                MCP-specific usage notes

prisma/
  schema.prisma           Generic RAG schema (collections, documents, chunks, sources, reviews, feedback, eval cases)
  seed.ts                  Seeds a sample collection describing this project

docs/                     Modular documentation (this directory)
CLAUDE.md                 Entry point for Claude Code sessions
CODEX.md                  Entry point for Codex sessions
AGENTS.md                 Project-specific coding notes shared by both assistants
README.md                 Human-facing quick start
.env.example              Documented environment variables (no secrets)
```

## Why the MCP server is separate from the app

`mcp/rag-manager` is not imported by the Next.js app and does not run inside it. It is a standalone process, started with `npm run mcp:rag-manager`, that an MCP client (Claude Desktop, Codex, etc.) launches and talks to over stdio. This keeps the Prisma client used by MCP tools isolated from anything that could end up in a browser bundle, and lets you add more MCP servers later under `mcp/<name>/` without touching the app.

See [MCP Server](mcp-server.md) for details.
