# Development Workflow

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

See [Testing](testing.md) for the manual verification checklist.
