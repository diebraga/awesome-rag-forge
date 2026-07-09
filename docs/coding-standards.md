# Coding Standards

## This is not the Next.js you know

This repo pins a Next.js version whose APIs, conventions, and file structure may differ from an assistant's training data. Before writing Next.js-specific code, check the bundled docs in `node_modules/next/dist/docs/` and heed any deprecation notices. See `AGENTS.md`.

## General rules

- Keep the MCP server (`mcp/rag-manager`) isolated. It has its own Prisma client instance (`mcp/rag-manager/prisma.ts`) and should not import from `app/` or vice versa. It may import pure (no-Prisma-client-of-its-own) logic from `lib/rag/`, same as the app does — see `lib/rag/harness.ts`.
- Keep RAG and harness domain logic centralized under `lib/rag/` (`retrieval.ts`, `chat-context.ts`, `harness.ts`), separate from generic infrastructure (`lib/prisma.ts`, `lib/storage.ts`, `lib/ollama.ts`, `lib/utils.ts`). If both the app and the MCP server need the same RAG/harness logic, it belongs in `lib/rag/`, not duplicated in both places.
- Within `lib/rag/`, keep the chat/creator split: `chat-context.ts` is the sole definition of the end-user-facing chat's behavior (identity, read-only rules, harness rendering — including that it must never narrate its own structure); `harness.ts` holds only shared, capability-neutral validation/data access. Never import `chat-context.ts` from `mcp/rag-manager/server.ts` — the MCP server's "how it talks" is its own tool descriptions, a different audience with different disclosure rules. See [System Architecture](../docs/architecture.md#two-audiences-kept-apart-on-purpose).
- Never import a Prisma client into a client component (`"use client"`). Prisma access belongs in server components, API routes, or the MCP server.
- Prefer generic field names (`category`, `domain`, `tags`, `metadata`) over domain-specific ones when extending the schema or tools — this project intentionally avoids baking in a single vertical's vocabulary.
- Every MCP tool that writes to the database needs a `userApproval: boolean` gate (or must itself be the human review step, like `approve_chunk`). A write tool with no confirmation step is a bug — see `docs/security.md#every-mcp-write-requires-explicit-approval--no-exceptions`.
- When updating a `metadata` JSON field on an existing row, merge with the existing value — never overwrite it outright, or you'll silently destroy data set elsewhere (e.g. ingestion's `insertedBy`/`warnings`).
- Harness rules (`HarnessRule`) describe behavior; they must never be able to grant a capability the code doesn't already enforce. Any change to `lib/rag/harness.ts`'s validation must keep the hardcoded blocklist — don't replace it with prompt-only guidance.
- Keep documentation modular: one topic per file under `docs/`, linked from `CLAUDE.md` / `CODEX.md` / `README.md` rather than duplicated inline.

## Style

- TypeScript throughout; avoid `any`.
- Validate MCP tool inputs with `zod` schemas (see `mcp/rag-manager/proposal.ts` for shared enums).
- Follow existing formatting (no repo-wide formatter is configured beyond ESLint; match surrounding code style).
