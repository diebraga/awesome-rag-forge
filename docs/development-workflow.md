# Development Workflow

## Prerequisites

Minimum requirements to run this project locally — nothing else is needed for the chat app and MCP server to work:

| Requirement | Why | Notes |
| --- | --- | --- |
| **Node.js ≥ 20.9** | Runs Next.js, the MCP server (`tsx`), and all scripts | Pinned in `package.json`'s `engines` field. Check with `node -v`. |
| **npm** | Package installation | Ships with Node. |
| **PostgreSQL with the `pgvector` extension** | `RagChunk.embedding` is a `vector(768)` column — `npx prisma db push` fails without it | Most managed Postgres providers (Neon, Supabase, Prisma Postgres, RDS w/ the extension enabled) support this out of the box. Self-hosting Postgres: `CREATE EXTENSION IF NOT EXISTS vector;` before the first `db push`. |
| **[Ollama](https://ollama.com)**, running, with a model pulled | Backs the chat's `/api/chat` route | Not required to browse Collections/Harness or to manage knowledge through the MCP server — only the chat feature needs it. `ollama pull qwen2.5:7b-instruct` (or whatever `OLLAMA_MODEL` is set to). |
| **An MCP client** (Claude Desktop, Claude Code, Codex CLI, etc.) | The chat app is read-only by design — nothing can be added, approved, or archived without an MCP client calling `mcp/rag-manager`'s tools | See [MCP Server](mcp-server.md#connecting-to-claude-desktop-or-codex) for client setup. |

Optional, only if you want uploaded files stored and downloadable (not required for text-only knowledge):

| Requirement | Why |
| --- | --- |
| An S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, ...) | `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY` — see [Environment Variables](environment-variables.md) |

If any required piece is missing, `npm run dev`/`npm run build`/`npx prisma db push` will fail with an error pointing at what's wrong — none of it fails silently.

## First-time local setup

```bash
git clone <your-fork-or-repo-url>
cd rag-builder-mcp
npm install
cp .env.example .env   # then fill in DATABASE_URL
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000` to use the chat UI. If [Ollama](https://ollama.com) isn't running yet, the chat UI shows a "Connect to Ollama" button that starts it for you (local dev only — see [API Routes](api-routes.md#post-apiollamastart)). If Ollama isn't installed at all, the button tells you so and links to ollama.com. Either way, make sure the configured model is pulled:

```bash
ollama pull qwen2.5:7b-instruct
```

The chat UI will tell you if Ollama is running but the model isn't pulled yet.

## Running the MCP server

```bash
npm run mcp:rag-manager
```

Normally you don't run this manually — an MCP client (Claude Desktop, Codex) launches it for you. Running it directly is useful for checking that it starts without errors. See [MCP Server](mcp-server.md) for client configuration.

## Everyday scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint. |
| `npm run db:push` | Apply the Prisma schema to your database (`prisma db push`). |
| `npm run db:seed` | Run `prisma/seed.ts`. |
| `npm run mcp:rag-manager` | Start the MCP server on stdio. |

## Making schema changes

1. Edit `prisma/schema.prisma`.
2. `npx prisma generate`
3. `npx prisma db push`
4. Update `prisma/seed.ts` and MCP tool input schemas (`mcp/rag-manager/proposal.ts`, `mcp/rag-manager/server.ts`) if fields changed.
5. Re-run the seed and manually verify `/api/rag` still returns data.

See [Testing](testing.md) for `npm test` coverage and the manual verification checklist.
