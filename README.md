# awesome-rag-forge

A generic RAG (retrieval-augmented generation) knowledge base builder, managed by talking to an AI assistant through an MCP server — not through a manual admin panel.

- **Chat app**: Next.js UI, **read-only**. It answers questions using approved RAG context so you can test retrieval and see what the knowledge base contains. It cannot create, edit, approve, reject, archive, or delete anything.
- **Knowledge management**: an MCP server (`mcp/rag-manager`), the **only** component that manages the knowledge base. An MCP-connected assistant inspects, proposes, and — only after your approval — writes to the knowledge base through it. Any MCP client can connect (Claude, Cursor, Windsurf, Copilot, Cline, Gemini CLI — see [Documentation](#documentation) below), not just one specific tool.
- **LLM backend**: swappable via a `ChatProvider` interface (`lib/chat-providers/`). Defaults to [Ollama](https://ollama.com), local and free, with automatic status detection and a "Connect to Ollama" fallback in the UI. See [LLM provider](#llm-provider) below.
- **Database**: Prisma + any Postgres-compatible database.

New knowledge always starts as `PENDING_REVIEW`. Nothing reaches the live chat until a human approves it through the MCP server.

> **If an AI assistant is reading this to set the project up** (someone pasted this repo's link into a chat): check the Prerequisites table below before running anything. Verify Node's version, whether the target Postgres database has the `pgvector` extension available, and whether Ollama/an MCP client are present — don't assume. Tell the user plainly what's missing and why, and offer to install what's safely automatable (`npm install`, `CREATE EXTENSION IF NOT EXISTS vector;` if the database is reachable, `ollama pull <model>` if Ollama is already running). Never install system-level software (Node, Postgres, Ollama, an MCP client) without asking first, and never invent, guess, or auto-fill secrets (`DATABASE_URL`, storage credentials) — those always require the user to obtain them from a real provider themselves. Once you're working from a local clone, [CLAUDE.md](CLAUDE.md) carries the fuller, repo-specific version of this same instruction — load it next.

## Prerequisites

| Requirement | Why |
| --- | --- |
| **Node.js ≥ 20.9** | Runs Next.js and the MCP server (`package.json`'s `engines` field) |
| **PostgreSQL with the `pgvector` extension** | `RagChunk.embedding` is `vector(768)` — schema push fails without it |
| **[Ollama](https://ollama.com)**, running, with a model pulled | Only the chat feature needs this — browsing Collections/Harness and managing knowledge through the MCP server don't |
| **An MCP client** (Claude Desktop, Claude Code, Codex CLI, ...) | The chat app is read-only by design — nothing can be added, approved, or archived without one |

Optional — only if you want uploaded files stored and downloadable:

| Requirement | Why |
| --- | --- |
| An S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, ...) | `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY` — see [Environment Variables](docs/environment-variables.md) |

Full detail, including how to enable `pgvector` and connect an MCP client: [docs/development-workflow.md](docs/development-workflow.md#prerequisites).

## Quick start

```bash
git clone <your-fork-or-repo-url>
cd awesome-rag-forge
npm install
cp .env.example .env   # fill in DATABASE_URL
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Make sure [Ollama](https://ollama.com) is running locally with the model from your `.env` pulled (default `qwen2.5:7b-instruct`).

To let an assistant manage the knowledge base, connect the MCP server — see [docs/mcp-server.md](docs/mcp-server.md).

## LLM provider

The chat's reply-generating backend is swappable, not hardcoded — `app/api/chat/route.ts` only ever talks to a `ChatProvider` interface (`lib/chat-providers/types.ts`), never to a specific model API directly. **Ollama is the default and the only provider implemented today**: it requires no API key, the app auto-detects whether it's running, offers to start it for you locally, and tells you clearly if it's missing rather than failing silently (see `docs/development-workflow.md`).

To point the chat at a different backend later, implement `ChatProvider` for it and register it in `lib/chat-providers/index.ts`; select it with the `CHAT_PROVIDER` env var (defaults to `"ollama"`). Provider credentials (a future `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) belong in `.env`, the same as `STORAGE_*` — never entered through the UI or stored in the database. No second provider exists yet; the interface exists so adding one is additive, not a rewrite of the chat route.

## Status: review dashboard

Today, approving, editing, and archiving knowledge happens through raw MCP tool calls (via whatever MCP client you're using — Claude, Cursor, etc.), not a dedicated screen. A human-friendly review dashboard is planned as a genuinely separate small application — not a write path bolted onto the read-only chat app — connecting to the MCP server's HTTP transport (`npm run mcp:rag-manager:http`, see [docs/mcp-server.md](docs/mcp-server.md#http-transport-for-a-web-based-client-eg-a-future-review-dashboard)) the same way any other MCP client does. The transport exists; the dashboard UI itself doesn't yet.

## Documentation

Full documentation lives in [`docs/`](docs/), organized by topic:

- [Project Overview](docs/overview.md)
- [Repository Structure](docs/repository-structure.md)
- [System Architecture](docs/architecture.md)
- [Database & Prisma](docs/database.md)
- [RAG Architecture](docs/rag.md)
- [MCP Server](docs/mcp-server.md)
- [API Routes](docs/api-routes.md)
- [Environment Variables](docs/environment-variables.md)
- [Development Workflow](docs/development-workflow.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Coding Standards](docs/coding-standards.md)
- [Contributing](docs/contributing.md)
- [Security Considerations](docs/security.md)

If you're working in this repo with an AI coding assistant, start from its entry-point file instead of this README — each one indexes the same `docs/` for AI-assisted sessions, so nothing is documented twice:

| Assistant | Entry file |
| --- | --- |
| Claude Code / Claude Desktop | [CLAUDE.md](CLAUDE.md) |
| OpenAI Codex CLI | [CODEX.md](CODEX.md) |
| Gemini CLI | [GEMINI.md](GEMINI.md) |
| Cursor | [.cursorrules](.cursorrules) |
| Windsurf | [.windsurfrules](.windsurfrules) |
| GitHub Copilot | [.github/copilot-instructions.md](.github/copilot-instructions.md) |
| Cline | [.clinerules](.clinerules) |

All of them are auto-loaded by their respective tool and share the same content: the read-only/MCP-write split, the documentation index, the prerequisites/setup instructions, and the non-negotiable rules. [AGENTS.md](AGENTS.md) holds the one coding note that applies regardless of which assistant is running.

## Example prompts (once your MCP client is connected)

- "Show me my current knowledge base."
- "Add this source to the knowledge base."
- "Search what we know about onboarding."
- "Approve this pending chunk."
- "Fix this fact — it's out of date."
- "Archive this document."
- "Create an eval case."

## License

Add a license before publishing this repository publicly if you intend to open-source it.
