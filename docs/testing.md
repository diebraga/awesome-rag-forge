# Testing

There is no automated test suite yet. Verification is currently manual. After any non-trivial change, run through this checklist:

1. **Type/generate check**: `npx prisma generate` succeeds.
2. **Schema sync**: `npx prisma db push` succeeds against your local database.
3. **Seed**: `npm run db:seed` succeeds and prints "Seeded RAG sample data."
4. **Lint**: `npm run lint` passes.
5. **Build**: `npm run build` succeeds.
6. **MCP server starts**: `npm run mcp:rag-manager` starts without throwing (Ctrl+C to stop; stdio servers don't print much when idle).
7. **Retrieval works end to end**: with the dev server running, `curl http://localhost:3000/api/rag` returns the seeded chunks (`count > 0`).
8. **Chat works end to end**: with Ollama running, ask a question in the browser chat UI related to the seeded content ("What does this project do?") and confirm the model uses the retrieved context.

## Suggested future additions

- Unit tests for `mcp/rag-manager/chunking.ts` (pure function, easy to test).
- Unit tests for `mcp/rag-manager/proposal.ts` (`buildSourceProposal` warnings logic).
- An integration test that runs the seed against a throwaway database and asserts `getRagContext()` returns the expected chunks.
- A regression suite built from `RagEvalCase` records.
