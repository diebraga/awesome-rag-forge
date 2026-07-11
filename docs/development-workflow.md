# Development Workflow

## Prerequisites

Minimum requirements to run this project locally — nothing else is needed for the chat app and MCP server to work:

| Requirement | Why | Notes |
| --- | --- | --- |
| **Node.js ≥ 20.9** | Runs Next.js, the MCP server (`tsx`), and all scripts | Pinned in `package.json`'s `engines` field. Check with `node -v`. |
| **npm** | Package installation | Ships with Node. |
| **PostgreSQL with the `pgvector` extension** | `RagChunk.embedding` is a `vector(768)` column — `npx prisma db push` fails without it | Most managed Postgres providers (Neon, Supabase, Prisma Postgres, RDS w/ the extension enabled) support this out of the box. For local setup, see [Local Postgres Setup](local-postgres.md). |
| **[Ollama](https://ollama.com)**, running, with a model pulled | Backs the chat's `/api/chat` route | Not required to browse Collections/Harness or to manage knowledge through the MCP server — only the chat feature needs it. `ollama pull qwen2.5:7b-instruct` (or whatever `OLLAMA_MODEL` is set to). |
| **An MCP client** (Claude Desktop, Claude Code, Codex CLI, etc.) | The chat app is read-only by design — nothing can be added, approved, or archived without an MCP client calling `mcp/rag-manager`'s tools | See [MCP Server](mcp-server.md#connecting-to-claude-desktop-or-codex) for client setup. |

Optional, only if you want uploaded files stored and downloadable (not required for text-only knowledge):

| Requirement | Why |
| --- | --- |
| An S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, ...) | `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY` — see [Environment Variables](environment-variables.md) |

If any required piece is missing, `npm run dev`/`npm run build`/`npx prisma db push` will fail with an error pointing at what's wrong — none of it fails silently.

### Installing missing prerequisites (with permission)

An AI assistant setting this project up must ask permission before installing any system-level dependency (see the root `CLAUDE.md` non-negotiable rules). To keep that from turning into a stop-and-ask loop: check everything first, ask permission for all missing pieces **in one message**, then run the vetted command below for each item the user approved, skipping — with a one-line note, not a pause — anything they didn't approve. Don't re-ask about an item already declined in this setup pass.

These are the vetted commands. Prefer them over improvising an install command, so behavior is consistent across machines and across the different AI assistants this repo supports:

| Tool | macOS | Linux | Windows |
| --- | --- | --- | --- |
| **Node.js** (≥ 20.9) | `brew install node` | `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh \| bash` then open a new shell and run `nvm install --lts` | `winget install OpenJS.NodeJS.LTS` |
| **Docker** (for local Postgres) | `brew install --cask docker` — then launch Docker Desktop once manually; it must be running before `npm run db:local:up` | `curl -fsSL https://get.docker.com \| sh` then `sudo usermod -aG docker $USER` (log out/in once for the group change to apply) | `winget install Docker.DockerDesktop` — then launch Docker Desktop once manually (requires WSL2, which the installer prompts for) |
| **Ollama** | `brew install ollama` | `curl -fsSL https://ollama.com/install.sh \| sh` | `winget install Ollama.Ollama` |

Notes that apply to all three:

- Docker Desktop and Ollama's background service both need to actually be *running*, not just installed — after install, verify with `docker info` / `curl http://localhost:11434` before assuming the step succeeded, and start the app/service if it isn't up yet.
- Native PostgreSQL install commands are intentionally not listed here: this project's default local path is `npm run db:local:up` (Docker Postgres + `pgvector` prebuilt), so installing Docker covers the database prerequisite without a separate native Postgres/pgvector install per OS. Only fall back to native Postgres if the user explicitly prefers it over Docker.
- After installing Node or Docker, a fresh shell/terminal (or a `source` of the shell profile) may be required before the new binary is on `PATH` — check with `node -v` / `docker -v` again rather than assuming the install alone was sufficient.

## Operator vs. Developer Mode

Most local MCP users should treat the server as a knowledge-base manager, not a code editor. See [Operating Modes](operating-modes.md).

This template sets `DEVELOPER_MODE=true` so developers can intentionally modify the repository after explicit user confirmation. This flag is only about source-code/schema/dependency/project-structure changes. Normal MCP knowledge-base operations, including approval-gated writes and archival actions, remain available either way. Non-technical users who only want MCP knowledge management should set `DEVELOPER_MODE=false` in `.env`.

## First-time local setup

First choose the database path:

- Paste an existing Postgres `DATABASE_URL` with `pgvector` enabled, or
- Ask the assistant to create a local Postgres database with Docker. See [Local Postgres Setup](local-postgres.md).

Then run:

```bash
git clone <your-fork-or-repo-url>
cd awesome-rag-forge
npm install
cp .env.example .env   # then fill DATABASE_URL, or use the local Docker URL from docs/local-postgres.md
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

## Final setup message

After setup, tell the user what is ready and what each surface can do. Use [Post-Install Handoff](post-install-handoff.md) as the shared wording for the final response.

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
| `npm run db:local:up` | Start the included local Postgres + pgvector Docker service. |
| `npm run db:local:down` | Stop and remove the local Docker service container while keeping its named volume. |
| `npm run db:local:logs` | Tail logs for the local Docker Postgres service. |
| `npm run mcp:rag-manager` | Start the MCP server on stdio. |
| `npm run generate:openapi` | Regenerate `app/api-docs/openapi.generated.json` from `@swagger` JSDoc comments in `app/api/**/route.ts`. Also runs automatically before `npm run build` (`prebuild`). See [API Routes](api-routes.md#api-docs-and-openapi-spec-api-docs-api-docsopenapijson). |

## Making schema changes

1. Edit `prisma/schema.prisma`.
2. `npx prisma generate`
3. `npx prisma db push`
4. Update `prisma/seed.ts` and MCP tool input schemas (`mcp/rag-manager/proposal.ts`, `mcp/rag-manager/server.ts`) if fields changed.
5. Re-run the seed and manually verify `/api/rag` still returns data.

See [Testing](testing.md) for `npm test` coverage and the manual verification checklist.
