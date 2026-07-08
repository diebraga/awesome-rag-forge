# Contributing

Contributions are welcome. This is an early-stage, opinionated starting point rather than a finished product — expect the schema and MCP tool surface to evolve.

## Before opening a PR

1. Run the full verification checklist in [Testing](testing.md).
2. If you changed the Prisma schema, confirm `npx prisma db push` and `npm run db:seed` both succeed from a clean database.
3. If you changed MCP tools, confirm `npm run mcp:rag-manager` starts without errors and update `mcp/rag-manager/README.md` and [MCP Server](mcp-server.md) if the tool list changed.
4. Keep documentation changes scoped to the relevant file(s) under `docs/` rather than growing `README.md`, `CLAUDE.md`, or `CODEX.md` into monoliths.

## Scope guidelines

- Keep the human-approval write path intact. Do not add a code path that lets an assistant write knowledge directly to `APPROVED` status without going through `PENDING_REVIEW` and an explicit review step.
- Keep domain-agnostic naming. Avoid reintroducing vertical-specific fields (e.g. legal, medical, or finance-specific columns) into the shared schema — use `category`/`domain`/`tags`/`metadata` instead.
- Avoid adding deployment or hosting automation without a clear opt-in — see [Deployment](deployment.md).

## Reporting issues

Open an issue describing the behavior you expected vs. what happened, including your Node version, Postgres provider, and whether you're using Ollama locally or a remote model server.
