# Repository Structure

```text
app/
  page.tsx                Chat UI (client component), fills the viewport height —
                           only its message list scrolls, never the page
  layout.tsx              Root layout: fixed-height (h-dvh) shell wrapping Header + page content
  collections/page.tsx      Plain read-only list of APPROVED collections
  collections/[collectionId]/page.tsx  Paginated, expandable document/chunk view for one collection
  harness/page.tsx          Read-only view of the chat's identity + APPROVED capabilities/restrictions
  review/page.tsx           Local-only review queue for PENDING_REVIEW chunks/harness rules —
                             reads Postgres directly, guarded by lib/local-review-guard.ts;
                             not an MCP client, not exposed publicly
  review/actions.ts           Server actions for approve/reject; each independently calls
                             assertLocalReviewMode() before writing
  api/chat/route.ts        Chat endpoint: calls Ollama with the full assistant context
  api/rag/route.ts         Debug endpoint: returns the current approved RAG context
  api/rag/context/route.ts  Full awareness bundle for external agents (identity, harness, stats, context)
  api/rag/collections/route.ts  Read-only approved external chat-visible collection list for the Collections page
  api/rag/collections/[collectionId]/route.ts  Read-only approved external chat-visible paginated collection detail
  api/rag/harness/route.ts   Read-only identity + APPROVED capabilities/restrictions for the Harness page
  api/ollama/status/route.ts Checks whether Ollama is reachable and the model is pulled
  api/ollama/start/route.ts  Local-only: starts Ollama for the "Connect" button

components/
  header.tsx               Minimal top nav: Chat / Collections / Harness links
  ui/                       shadcn UI primitives (Button, Input, Avatar, ScrollArea, Separator)
components.json           shadcn configuration

lib/
  rag/                    Centralized RAG + harness domain logic (separate from generic infra below)
    retrieval.ts           getRagContext() — approved hybrid semantic/lexical retrieval, read-only
    chat-context.ts          buildAssistantContext() — sole definition of how the
                              end-user-facing chat behaves: identity, read-only
                              rules, harness rendering, anti-injection guard
    harness.ts                shared, capability-neutral: rule validation and
                              data access only, used identically by the chat
                              and the MCP server, so rules can't drift
    collections.ts              listApprovedCollections() / getCollectionDetail() — read-only,
                              approved external chat-visible data for the Collections pages. The
                              Harness page reuses getAssistantConfig() (chat-context.ts)
                              and getApprovedHarnessRules() (harness.ts) directly instead.
    chunk-embeddings.ts          embedChunkForApproval()/storeChunkEmbedding() — shared between
                              the MCP server's approve_chunk and app/review/actions.ts, so both
                              approval paths embed identically; moved here from mcp/rag-manager/
                              because it's pure logic both sides need (see coding-standards.md)
    retrieval-enrichment.ts      Alias/hypernym generation for chunk metadata, same
                              shared-logic reasoning as chunk-embeddings.ts above
  local-review-guard.ts    assertLocalReviewMode() — fails closed unless ENABLE_TESTING_SURFACE=true
                            and the runtime isn't production-like; the one gate every /review
                            server action calls independently before writing
  chat-providers/          Swappable chat LLM backend (see docs/mcp-server.md's LLM provider note)
    types.ts                 ChatProvider interface — app/api/chat/route.ts only talks to this
    ollama.ts                 Default/only implementation today, wraps lib/ollama.ts's calls
    index.ts                   getChatProvider() — reads CHAT_PROVIDER, defaults to "ollama"
  prisma.ts               Prisma client for the Next.js app (server-only)
  storage.ts               Gates document-attachment features behind storage env vars
  ollama.ts                 Ollama connection config + local-only auto-start logic
  utils.ts                   shadcn class-name helper

mcp/
  rag-manager/            Isolated MCP server for managing the knowledge base and harness
    server.ts               Tool registrations (list, propose, approve, review, feedback, eval, harness);
                              exports `server` so http.ts can reuse the same tool registry
    http.ts                   Optional HTTP transport (npm run mcp:rag-manager:http), localhost-only
                              by default — same tools as stdio, for clients that can't spawn a
                              stdio subprocess; `/review` does not use this transport
    extraction.ts              PDF text extraction (pdf-parse) + OCR fallback (tesseract.js)
    proposal.ts              Builds and validates source-insert / file-upload proposals
    review-triage.ts           buildReviewTriage() — classifies a proposal's disposition
                              (READY_FOR_BATCH_APPROVAL/NEEDS_REVIEW/CONFLICTS_WITH_APPROVED/
                              DUPLICATE_OR_UPDATE_CANDIDATE) for prioritization only;
                              trustedUseBlocked marks whether knowledge needs a user decision before trusted use on
                              every branch — it can never mark content auto-approvable
    chunking.ts               Paragraph-based and page-aware chunking; estimateTokens() is shared
    prisma.ts                 Prisma client for the MCP server (separate from lib/prisma.ts)
    README.md                  MCP-specific usage notes

prisma/
  schema.prisma           Generic RAG + harness schema (collections, documents, chunks, sources,
                           reviews, feedback, eval cases, assistant config, harness rules)
  seed.ts                  Seeds a sample collection, default assistant name, and default harness rules

public-site/              The ONLY thing meant to be deployed publicly — see docs/deployment.md
  index.html               Single static file, no framework, no build step, no server code.
                           Fetches and renders README.md live from GitHub client-side.

docs/                     Modular documentation (this directory)
CLAUDE.md                 Entry point for Claude Code / Claude Desktop sessions
CODEX.md                  Entry point for OpenAI Codex CLI sessions
GEMINI.md                 Entry point for Gemini CLI sessions
.cursorrules              Entry point for Cursor sessions
.windsurfrules            Entry point for Windsurf sessions
.github/copilot-instructions.md  Entry point for GitHub Copilot sessions
.clinerules               Entry point for Cline sessions
AGENTS.md                 Project-specific coding notes shared by every assistant above
README.md                 Human-facing quick start
.env.example              Documented environment variables (no secrets)
```

All seven assistant entry-point files carry identical content (documentation index, prerequisites/setup instructions, non-negotiable rules) — each is just a thin, auto-loaded pointer into `docs/` for its respective tool, kept in sync by hand. If you change one, change all seven.

## Why `lib/rag/` is its own folder

RAG and harness logic is centralized under `lib/rag/`, separate from generic app infrastructure (`lib/prisma.ts`, `lib/storage.ts`, `lib/ollama.ts`, `lib/utils.ts`, none of which are RAG-specific). `lib/rag/harness.ts` in particular is imported by both the Next.js app (read side) and the MCP server (write side, via a relative import) so validation rules can't drift between them. See [System Architecture](architecture.md#lib-rag--where-all-rag-and-harness-logic-lives).

Within `lib/rag/`, `chat-context.ts` and `harness.ts` are split for a reason beyond convenience: `chat-context.ts` is the complete, sole definition of how the end-user-facing chat talks (including that it must never narrate its own structure); `harness.ts` holds only shared, capability-neutral validation and data access that both the chat and the MCP server need identically. The MCP server's own "how it talks" — its tool descriptions — lives entirely in `mcp/rag-manager/server.ts` and must never import `chat-context.ts`. See [System Architecture](architecture.md#two-audiences-kept-apart-on-purpose).

## Why the MCP server is separate from the app

`mcp/rag-manager` is not imported by the Next.js app and does not run inside it. It is a standalone process, started with `npm run mcp:rag-manager`, that an MCP client (Claude Desktop, Codex, etc.) launches and talks to over stdio. This keeps the Prisma client used by MCP tools isolated from anything that could end up in a browser bundle, and lets you add more MCP servers later under `mcp/<name>/` without touching the app.

See [MCP Server](mcp-server.md) for details.
