# Testing

## Automated

`npm test` runs [Vitest](https://vitest.dev) (`vitest.config.ts`) against every `**/*.test.ts` file. Coverage today is intentionally narrow and targeted at the highest-risk logic, not broad:

- [`lib/rag/harness.test.ts`](../lib/rag/harness.test.ts) — table-driven tests for `validateHarnessStatement()`: every evasive phrasing that motivated the blocklist→allowlist change (`"amend"`, `"curate on the user's behalf"`, `"circumvent"`, etc.), the original literal-word phrasings, the actual seeded legitimate capabilities (so tightening the check can never silently break real usage), and the `PROTECTION_REMOVAL_PATTERNS` refusals. This is the single most safety-critical pure function in the codebase — it's the one place a natural-language capability claim is validated in code rather than trusted from a prompt — so it gets the most direct coverage.

Run it before any change to `lib/rag/harness.ts`, `mcp/rag-manager/chunking.ts`, or `mcp/rag-manager/proposal.ts` — these are pure functions with no DB/network dependency, so they're cheap to test and a regression here is easy to ship unnoticed otherwise (see `docs/security.md`'s note on the `approve_chunk` document-status bug, caught by hand, not by a test).

## Manual

The propose→approve write paths and the chat UI still require manual verification — there is no test database harness yet (see "Suggested future additions" below). After any non-trivial change, run through this checklist:

1. **Type/generate check**: `npx prisma generate` succeeds.
2. **Schema sync**: `npx prisma db push` succeeds against your local database.
3. **Seed**: `npm run db:seed` succeeds and prints "Seeded RAG sample data."
4. **Test**: `npm test` passes.
5. **Lint**: `npm run lint` passes.
6. **Build**: `npm run build` succeeds.
7. **MCP server starts**: `npm run mcp:rag-manager` starts without throwing (Ctrl+C to stop; stdio servers don't print much when idle).
8. **Retrieval works end to end**: with the dev server running, `curl http://localhost:3000/api/rag` returns the seeded chunks (`count > 0`).
9. **Chat works end to end**: with Ollama running, ask a question in the browser chat UI related to the seeded content ("What does this project do?") and confirm the model uses the retrieved context.
10. **Archiving works**: call `archive_document` on a test document with `userApproval: true`, confirm its status becomes `ARCHIVED`, it disappears from `/api/rag`'s retrieved context and from the Collections pages, and (if `deleteStoredFile: true` was used) that the file is actually gone from the bucket.
11. **Editing works**: call `propose_chunk_update` on an `APPROVED` chunk, confirm the diff looks right and `willReenterReview: true`. Call `approve_chunk_update` with `userApproval: true`, confirm the chunk's status is now `PENDING_REVIEW` (not still `APPROVED`) and it stops showing up in retrieved chat context. `approve_chunk` it again and confirm the *new* text is what the chat now returns.
12. **Chat provider refactor didn't change behavior**: with `CHAT_PROVIDER` unset (defaults to `ollama`), the chat UI must behave identically to before — same connect/status/model-pull flow, same reply shape. If you add a second provider later, add this same check for it.
13. **HTTP transport works**: `npm run mcp:rag-manager:http`, then connect with the MCP TypeScript SDK's `Client` + `StreamableHTTPClientTransport` against `http://127.0.0.1:$MCP_HTTP_PORT/mcp` (default port `3200`) and confirm `listTools()` returns the full tool list and a real tool call (e.g. `list_collections`) succeeds.

## Suggested future additions

- Unit tests for `mcp/rag-manager/chunking.ts` (pure function, easy to test).
- Unit tests for `mcp/rag-manager/proposal.ts` (`buildSourceProposal`/`buildFileProposal` warnings logic).
- An integration test harness (throwaway test database) covering the `propose_*`/`approve_*` transaction paths in `mcp/rag-manager/server.ts` directly — including a regression test for the `approve_chunk` → parent-document-status fix, so that specific bug class can't reappear silently.
- A regression suite built from `RagEvalCase` records.
