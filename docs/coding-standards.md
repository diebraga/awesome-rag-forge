# Coding Standards

## This is not the Next.js you know

This repo pins a Next.js version whose APIs, conventions, and file structure may differ from an assistant's training data. Before writing Next.js-specific code, check the bundled docs in `node_modules/next/dist/docs/` and heed any deprecation notices. See `AGENTS.md`.

## General rules

- Keep the MCP server (`mcp/rag-manager`) isolated. It has its own Prisma client instance (`mcp/rag-manager/prisma.ts`) and should not import from `app/` or vice versa.
- Never import a Prisma client into a client component (`"use client"`). Prisma access belongs in server components, API routes, or the MCP server.
- Prefer generic field names (`category`, `domain`, `tags`, `metadata`) over domain-specific ones when extending the schema or tools — this project intentionally avoids baking in a single vertical's vocabulary.
- MCP tools that write to the database must justify why they don't need the propose/approve flow. The default assumption is that new knowledge requires human approval before becoming `APPROVED`.
- Keep documentation modular: one topic per file under `docs/`, linked from `CLAUDE.md` / `CODEX.md` / `README.md` rather than duplicated inline.

## Style

- TypeScript throughout; avoid `any`.
- Validate MCP tool inputs with `zod` schemas (see `mcp/rag-manager/proposal.ts` for shared enums).
- Follow existing formatting (no repo-wide formatter is configured beyond ESLint; match surrounding code style).
