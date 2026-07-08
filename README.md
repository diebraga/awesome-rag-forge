# talk-to-rag-mcp

A generic RAG (retrieval-augmented generation) knowledge base builder, managed by talking to an AI assistant through an MCP server — not through a manual admin panel.

- **Chat app**: Next.js UI backed by a local model (Ollama) plus approved RAG context.
- **Knowledge management**: an MCP server (`mcp/rag-manager`) that lets an MCP-connected assistant inspect, propose, and — only after your approval — write to the knowledge base.
- **Database**: Prisma + any Postgres-compatible database.

New knowledge always starts as `PENDING_REVIEW`. Nothing reaches the live chat until a human approves it.

## Quick start

```bash
git clone <your-fork-or-repo-url>
cd talk-to-rag-mcp
npm install
cp .env.example .env   # fill in DATABASE_URL
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Make sure [Ollama](https://ollama.com) is running locally with the model from your `.env` pulled (default `qwen2.5:7b-instruct`).

To let an assistant manage the knowledge base, connect the MCP server — see [docs/mcp-server.md](docs/mcp-server.md).

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

If you're working in this repo with Claude Code or Codex, start from [CLAUDE.md](CLAUDE.md) or [CODEX.md](CODEX.md) instead — they index the same docs for AI-assisted sessions.

## Example prompts (once your MCP client is connected)

- "Show me my current knowledge base."
- "Add this source to the knowledge base."
- "Search what we know about onboarding."
- "Approve this pending chunk."
- "Create an eval case."

## License

Add a license before publishing this repository publicly if you intend to open-source it.
