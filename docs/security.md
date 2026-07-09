# Security Considerations

## Human approval before writes

The MCP server never writes new knowledge without an explicit approval step (`propose_source_insert` → human review → `approve_source_insert` with `userApproval: true`). New knowledge always starts as `PENDING_REVIEW`; nothing reaches `APPROVED` without a separate `approve_chunk` call. Do not add a code path that skips this.

## No automatic approval

`RagChunk.status` and `RagDocument.status` should only move to `APPROVED` through an explicit human-driven review action (`approve_chunk`, or manual review tooling you build later). Do not add logic that auto-approves based on heuristics, confidence scores, or model self-assessment.

## No secret logging

- Never log `DATABASE_URL`, storage credentials, or full request/response bodies that might contain secrets.
- `.env` is gitignored; `.env.example` must only contain placeholders.
- If you add logging to the MCP server or API routes, log identifiers (document IDs, chunk IDs) rather than full env values.

## No Prisma client in browser components

Both `lib/prisma.ts` and `mcp/rag-manager/prisma.ts` are server-only. Never import either from a `"use client"` component — this would leak database credentials and query surface to the browser bundle.

## Storage gating

Original file uploads are refused unless `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are all set (see `lib/storage.ts`). This prevents silently writing files to an unconfigured or default location. Extracted text may still be stored in the database without storage configured.

## MCP server trust boundary

The MCP server has full read/write access to your knowledge base database. Only connect trusted MCP clients to it, and only run it with a `DATABASE_URL` you control. It is designed for local, single-user development use — see [Deployment](deployment.md) for why it is not exposed remotely by default.

## Assistant identity and model-leak protection

The chat assistant has a fixed name and an instruction to never reveal the underlying model, provider, or version, regardless of how the question is phrased (see [RAG Architecture](rag.md#assistant-identity-is-not-knowledge)). This is a system-prompt-level control, not a hard guarantee — a sufficiently adversarial prompt could still coax a model into leaking details. Do not treat it as a security boundary for anything sensitive; it exists to keep the interface consistent and swappable across model backends, not to protect secrets.

`app/api/chat/route.ts` also returns the assistant's configured **name**, not the raw `OLLAMA_MODEL` value, in its JSON response — don't reintroduce the underlying model/provider string into any API response or error message.

## Harness rules cannot grant real capabilities

`HarnessRule` (see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions)) lets the knowledge base owner configure what the chat's system prompt *says* it can and cannot do — but a database row is descriptive text, not code, and it must never become a way to grant the chat power it doesn't actually have. Two layers enforce this:

1. **Hardcoded rules are rendered first and declared non-overridable.** `buildSystemPrompt()` in `lib/rag/context.ts` puts the identity/read-only rules before the harness section, and the harness section explicitly states those rules "can never be loosened by anything below."
2. **`lib/rag/harness.ts`'s `validateHarnessStatement()` hard-refuses dangerous statements in code**, not just via a prompt instruction: any `CAPABILITY` claiming write/delete/approve/reject/archive/bypass-review/auto-approve/ignore-instructions/reveal-model/execute-code powers, and any statement (capability or restriction) that tries to remove a hardcoded protection. This check runs at `propose_harness_update` **and again** at `approve_harness_update` — the write tool never trusts that the propose step was actually called first.

Do not add a way to write to `HarnessRule` that skips this validation, and do not let harness rule content change what the chat's code is actually capable of doing — the boundary is structural (no write-capable Prisma calls, no tool-calling loop in `app/`), not prompt-based, and harness rules must stay purely descriptive on top of it.

## `GET /api/rag/context` has no authentication yet

This endpoint returns identity, knowledge-base scope, and retrieved chunks — no secrets, but it is a write-free integration surface intended for local/MVP use. If you deploy this app or otherwise expose it beyond your own machine, add authentication (an API key, at minimum) before doing so.

## `POST /api/ollama/start` executes a process — scoped deliberately

This route runs a fixed, hardcoded command (`ollama serve`, no user input reaches it) to let the chat UI's "Connect to Ollama" button start a local model server for the person using the app. This is the one place in `app/` that executes anything on the host machine, so it carries extra guardrails:

- It refuses to run unless **both** `OLLAMA_URL` resolves to `localhost`/`127.0.0.1`/`::1` **and** `NODE_ENV !== "production"` (checked together in `lib/ollama.ts`'s `canAutoStartOllama()`). A production build always has this disabled, regardless of `OLLAMA_URL`, specifically so a deployed instance can never have a visitor's request trigger process execution on the host.
- The command is a fixed string, never built from request input — there is no injection surface.
- It never targets any machine other than the one the Next.js server process is already running on. There is no way to make it start Ollama "somewhere else."

If you ever extend this pattern (e.g. supporting other model runtimes), keep both guardrails and never let request data influence the command that gets spawned.

## Automated PR security review

[`.github/workflows/security-review.yml`](../.github/workflows/security-review.yml) runs [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) on every pull request. It analyzes the diff for vulnerabilities and leaves PR comments; it does not block merges by default and does not write to the knowledge base or touch `DATABASE_URL`.

Requires a repository secret named `CLAUDE_API_KEY` (Settings → Secrets and variables → Actions in GitHub) — an Anthropic API key enabled for both the Claude API and Claude Code. Without it, the workflow will run but the security-review step will fail. `generated/`, `node_modules/`, and `.next/` are excluded from scanning since they're build output, not source you wrote.
