# Development Workflow

## First-time local setup

```bash
git clone <your-fork-or-repo-url>
cd talk-to-rag-mcp
npm install
cp .env.example .env   # then fill in DATABASE_URL
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

In a separate terminal, make sure [Ollama](https://ollama.com) is running with the configured model pulled:

```bash
ollama pull qwen2.5:7b-instruct
```

Open `http://localhost:3000` to use the chat UI.

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
