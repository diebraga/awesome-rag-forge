# Security Considerations

## Human approval before writes

The MCP server never writes new knowledge without an explicit approval step (`propose_source_insert` → human review → `approve_source_insert` with `userApproval: true`). New knowledge always starts as `PENDING_REVIEW`; nothing reaches `APPROVED` without a separate `approve_chunk` call. Do not add a code path that skips this.

## No automatic approval

`RagChunk.status` and `RagDocument.status` should only move to `APPROVED` through an explicit human-driven review action (`approve_chunk`, or manual review tooling you build later). Do not add logic that auto-approves based on heuristics, confidence scores, or model self-assessment.

`approve_chunk` flipping `RagDocument.status` to `APPROVED` alongside the chunk it was called on is **not** an exception to this — it's still gated behind the same explicit, human-invoked `approve_chunk` call as the chunk itself; nothing decides on its own that a document is ready. Don't read "a document becomes APPROVED automatically when a chunk is approved" as license to add a scheduled job, heuristic, or bulk auto-approval path — the trigger must always be one human calling `approve_chunk` (or `reject_chunk`) on one chunk at a time.

The reverse direction is enforced too: `approve_chunk_update` **removes** `APPROVED` status (resets to `PENDING_REVIEW`) whenever it edits a chunk that had it. This is deliberate, not a bug to "fix" by preserving the old status — an edited fact wasn't the fact a human actually reviewed, so it doesn't get to keep an approval it never earned. If you ever touch `approve_chunk_update`, keep this: editing a live chunk must always cost it its `APPROVED` status, with no exception for "small" or "obviously correct" edits.

## No secret logging

- Never log `DATABASE_URL`, storage credentials, or full request/response bodies that might contain secrets.
- `.env` is gitignored; `.env.example` must only contain placeholders.
- If you add logging to the MCP server or API routes, log identifiers (document IDs, chunk IDs) rather than full env values.

## Local secret onboarding — never paste secrets into an AI assistant's chat

`DATABASE_URL`, provider API keys, and storage credentials must never be typed into a chat with an AI coding assistant — that puts a real secret into a cloud-hosted conversation transcript, which is the wrong place for it regardless of how "local" or "just a test" the setup feels.

Instead: run `npm run setup` yourself, in your own terminal. It asks for each value one at a time with masked input (each keystroke echoes as `*`) and writes it straight into `.env`; nothing is echoed back, logged, or transmitted anywhere. All fields except `DATABASE_URL` are optional — press enter to skip. When an AI assistant needs you to configure secrets, it should tell you to run this command (and, where the platform supports it, open a separate terminal window for you) rather than ever asking you to paste a value into the chat.

To confirm setup worked without the assistant ever opening `.env`, run `npm run check:env` — it reports only `connected`/`failed` per service (`lib/database-health.ts`'s `getDatabaseConnectionStatus`, `lib/storage.ts`'s `getStorageConnectionStatus`), never the underlying URL or keys. An assistant can safely run this itself and read its output.

**The full ritual an assistant follows every time this flow is invoked:**
1. Tell the user to run `npm run setup`; on a platform where a separate terminal window can be opened (e.g. macOS via `osascript`), open one — `cd` into the repo root explicitly in that same command, since a freshly opened terminal is not guaranteed to start in the project directory.
2. Ask the user with a proper multiple-choice question, not a plain sentence: **Yes, it finished** / **No, it didn't**. Only these two — don't add a manual third "Other" option, since the question tool already offers a free-text "Other" automatically for anything that doesn't fit (an error, unsure, etc.); adding your own duplicates it.
3. If "Yes," run `npm run check:env` yourself and report the result.
4. If "No" or the user picked the built-in "Other" to describe something else, do not just leave it there. Ask what happened (or what the terminal showed), diagnose it (a very common one: the window opened in the wrong directory and couldn't find `package.json`), and offer to reopen a corrected terminal so they can retry. Repeat from step 2.

This project's `.claude/settings.json` adds a `permissions.deny` rule blocking Claude Code's own `Read` tool and common `Bash` read patterns (`cat`, `less`, `head`, `tail`, `grep`) against `.env` — enforced by the tool-permission layer before the request reaches the model, the same category as this project's other hardcoded rules that a prompt can't talk it out of. Be honest about the limit: `Bash` is a general-purpose shell, so a sufficiently indirect command could still slip past a pattern-based deny list — this is defense-in-depth, not a cryptographic guarantee. The paired behavioral commitment (documented in every AI-instruction file in this repo) is that the assistant does not intentionally read `.env` and only ever uses `npm run check:env` to verify configuration. A genuinely unbypassable version would store secrets in the OS's native credential vault (Keychain/Credential Manager/keyring) with per-access user authorization instead of a plain-text file — not built here, a documented future option if you need that guarantee.

## No Prisma client in browser components

Both `lib/prisma.ts` and `mcp/rag-manager/prisma.ts` are server-only. Never import either from a `"use client"` component — this would leak database credentials and query surface to the browser bundle.

## Storage gating

Original file storage is refused unless `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` are all set (see `lib/storage.ts`). This prevents silently writing original files to an unconfigured or default location. Extracted PDF text may still be stored in the database without storage configured; `approve_file_upload` and `approve_file_upload_batch` fall back to text-only storage when `storeOriginalFile: true` but storage is missing. `attach_document_file` still refuses outright because its only purpose is attaching an original file.

The bucket itself should be kept private (no public-read policy). `lib/storage.ts`'s `getDownloadUrl()` generates a presigned `GetObject` URL that expires after 5 minutes, and `GET /api/rag/documents/[id]/download` is the only code path that calls it — gated to `status: APPROVED` documents with a non-null `storageKey`, same as every other read in `app/`. Never add a route or tool that returns a longer-lived or unauthenticated direct bucket URL; always go through `getDownloadUrl()` so the expiry and the APPROVED-only gate stay in one place.

## MCP server trust boundary

The MCP server has full read/write access to your knowledge base database. Only connect trusted MCP clients to it, and only run it with a `DATABASE_URL` you control. It is designed for local, single-user development use — see [Deployment](deployment.md) for why it is not exposed remotely by default.

This applies identically to the HTTP transport (`npm run mcp:rag-manager:http`, see [MCP Server](mcp-server.md#http-transport-for-a-web-based-client-eg-a-future-review-dashboard)) — same server, same full read/write access, just reachable over HTTP instead of stdio for clients that need it (a browser-based tool, for instance). It's bound to `127.0.0.1` by default for the same reason `canAutoStartOllama()` is local-only in `lib/ollama.ts`: no accidental network exposure.

Every request to this transport requires an `Authorization: Bearer <token>` header matching `MCP_AUTH_TOKEN`, checked with a timing-safe comparison in `mcp/rag-manager/http-auth.ts` before the MCP transport ever sees the request. `MCP_AUTH_TOKEN` is generated automatically on first run (`mcp/rag-manager/http.ts`) and appended to `.env` — there is no code path that starts this server without requiring a token. This is deliberately a different credential from `APP_API_KEY`: that key guards the read-only Next.js testing surface, this one guards full knowledge-base write access, and a leak of one must not compromise the other. If you ever bind this transport beyond localhost, treat `MCP_AUTH_TOKEN` as the thing standing between the internet and your database — rotate it (delete the line from `.env` and restart to generate a new one) if you ever suspect it leaked, and don't treat a non-default `MCP_HTTP_HOST` as safe on its own regardless.

## Assistant identity and model-leak protection

The chat assistant has a fixed name and an instruction to never reveal the underlying model, provider, or version, regardless of how the question is phrased (see [RAG Architecture](rag.md#assistant-identity-is-not-knowledge)). This is a system-prompt-level control, not a hard guarantee — a sufficiently adversarial prompt could still coax a model into leaking details. Do not treat it as a security boundary for anything sensitive; it exists to keep the interface consistent and swappable across model backends, not to protect secrets.

`app/api/chat/route.ts` also returns the assistant's configured **name**, not the raw `OLLAMA_MODEL` value, in its JSON response — don't reintroduce the underlying model/provider string into any API response or error message.

## Two audiences, two disclosure levels

The chat (`app/`) and the MCP server (`mcp/rag-manager`) are not just gated differently on writes — they're gated differently on **what they're allowed to say**, because they have different audiences:

- The chat is end-user facing. It must never narrate its own structure — collection names, categories, tags, document counts — even though `buildAssistantContext()` in `lib/rag/chat-context.ts` does compute that data internally (for its own calibration). The system prompt explicitly instructs it not to recite this, and the seeded harness restrictions reinforce it (`harness_rule_seed_restrict_structure`). This is a behavioral instruction, not a data-access boundary — the model technically "knows" the counts, it's just told never to say them.
- The MCP server is creator facing. `list_collections`, `list_documents`, and `get_harness_rules` intentionally return full, named, structural data — the person building the knowledge base needs this. Do not add a similar restriction there.
- The Collections pages (`app/collections/`, backed by `lib/rag/collections.ts` and `GET /api/rag/collections*`) are still end-user facing and still `APPROVED`-only — same visibility as the chat, no write path — but they *do* show collection/document names, on purpose. That's a deliberate feature, not a regression: the chat's restriction is about conversational narration, not about every read-only view in `app/`. If you extend these pages, keep them read-only and `APPROVED`-only; don't let them grow a write path or start showing `DRAFT`/`PENDING_REVIEW`/`REJECTED` content.
- The Harness page (`app/harness/`, backed by `GET /api/rag/harness`) is the same pattern for identity/harness data: read-only, `APPROVED`-only capabilities/restrictions, no write path. Keep `RagReview`, `RagFeedback`, and `RagEvalCase` off both of these pages — they're creator/operational data (audit trail, unreviewed user text, testing artifacts), not knowledge content, and don't belong on the end-user-facing surface.

If you extend `lib/rag/chat-context.ts`, keep this distinction: anything meant to inform the *creator* belongs in an MCP tool, not in data exposed to the chat's system prompt.

## Retrieved content is data, not instructions

`buildSystemPrompt()` in `lib/rag/chat-context.ts` explicitly tells the model to treat retrieved chunk text as citable data, never as instructions to follow — even if a chunk contains something that reads like a command. This is the actual defense against a poisoned/tricked knowledge chunk trying to hijack the model's behavior after being approved (as opposed to a prompt-injection attempt aimed at the harness config itself, which `validateHarnessStatement()` blocks at write time — see below). Keep this instruction if you ever change how `ragContext` is assembled into the prompt.

## Harness rules cannot grant real capabilities

`HarnessRule` (see [RAG Architecture](rag.md#the-harness-capabilities-and-restrictions)) lets the knowledge base owner configure what the chat's system prompt *says* it can and cannot do — but a database row is descriptive text, not code, and it must never become a way to grant the chat power it doesn't actually have. Two layers enforce this:

1. **Hardcoded rules are rendered first and declared non-overridable.** `buildSystemPrompt()` in `lib/rag/chat-context.ts` puts the identity/read-only rules before the harness section, and the harness section explicitly states those rules "can never be loosened by anything below."
2. **`lib/rag/harness.ts`'s `validateHarnessStatement()` hard-refuses dangerous statements in code**, not just via a prompt instruction: any `CAPABILITY` claiming write/delete/approve/reject/archive/bypass-review/auto-approve/ignore-instructions/reveal-model/execute-code powers, and any statement (capability or restriction) that tries to remove a hardcoded protection. This check runs at `propose_harness_update` **and again** at `approve_harness_update` — the write tool never trusts that the propose step was actually called first.

   A literal-word blocklist alone is evadable by rephrasing (`"amend"` instead of `"edit"`, `"curate knowledge on the user's behalf"` instead of `"write"`) — `DANGEROUS_CAPABILITY_PATTERNS` casts a wide net of synonyms per dangerous action for exactly this reason, but a blocklist is still fundamentally a losing game against arbitrary natural language. Because legitimate chat capabilities are a small, enumerable set, `CAPABILITY` statements are also checked against `SAFE_CAPABILITY_PATTERNS` — an allowlist of known-safe read-only verbs (search, answer, cite, summarize, explain, list, describe, help, assist, read, recommend). A statement matching neither list is refused by default, rather than silently allowed through. If you add a new legitimate capability phrasing that gets refused, extend the allowlist — do not weaken or remove the default-deny behavior to fix a false positive. `lib/rag/harness.test.ts` is the regression suite for both lists; run it before touching either.

Do not add a way to write to `HarnessRule` that skips this validation, and do not let harness rule content change what the chat's code is actually capable of doing — the boundary is structural (no write-capable Prisma calls, no tool-calling loop in `app/`), not prompt-based, and harness rules must stay purely descriptive on top of it.

## Every MCP write requires explicit approval — no exceptions

Every tool in `mcp/rag-manager/server.ts` that writes to the database takes a `userApproval: boolean` (or is itself the human review step, like `approve_chunk`/`approve_harness_rule`) and refuses with a clear message if it isn't `true`. This includes `create_collection` and `attach_document_file`, which were originally direct writes with no gate — both now require `userApproval: true` like every other write tool. If you add a new MCP tool that writes anything, give it the same gate; a write tool with no confirmation step is a bug, not a design choice.

`archive_document` — the tool that removes knowledge from use, including optionally deleting a stored file — follows the same rule: `userApproval: true` required, no exceptions, same as inserting new knowledge. It also never hard-deletes a `RagDocument`/`RagChunk` row; it only ever changes `status` to `ARCHIVED`, which is what keeps `RagReview`/`RagFeedback` audit history intact instead of cascading it away. If you're tempted to add a real `DELETE` path later, don't — archiving already achieves "gone from every read surface" without losing the audit trail, and a hard delete would.

`attach_document_file` also merges into a document's existing `metadata` JSON instead of overwriting it — it fetches the current value first and spreads it before adding `originalFileName`. A prior version replaced the field outright, silently discarding anything already there (e.g. `insertedBy`/`warnings` set during ingestion). Any future code that updates `metadata` on an existing row should merge, not overwrite, for the same reason.

## Testing surface exposure gate

The Next.js testing surface is enabled only when `ENABLE_TESTING_SURFACE=true`. `.env.example` sets it to true for local clones, but missing/unset is disabled. When disabled, the testing pages render a disabled-mode message and the supporting API routes return 404 JSON. This includes `/`, `/collections`, `/harness`, `/api/chat`, `/api/feedback`, `/api/rag*`, and `/api/ollama*`.

This is the outer exposure switch. The enabled testing API routes also support `APP_API_KEY`: if the key is configured, requests must send `Authorization: Bearer <key>`; if a Vercel deployment explicitly enables the testing surface without configuring the key, pages show setup instructions and APIs return `503`. Local clones can leave the key blank for frictionless use. Do not remove the guard to make a deployed route work; intentionally enable the flag and configure the key, or keep it closed. See [Testing Surface](testing-surface.md).

Reviewed and confirmed intentional: defaulting `true` in `.env.example` (a local template file) is not a vulnerability, because deployment targets don't inherit from it — each one (Vercel, another host) has its own separately-configured environment, and exposing the surface anywhere but a local checkout requires an operator to deliberately set the var in that environment themselves. Don't flag or "fix" this default without re-reading this note first.

## Testing API authentication

`APP_API_KEY` protects the Next.js testing API routes when configured: `/api/chat`, `/api/feedback`, `/api/rag*`, and `/api/ollama*`. The same shared readiness gate checks database health, `ENABLE_TESTING_SURFACE`, and then API-key auth before route-specific code runs. Expected failures return JSON and never expose raw database/provider errors.

This key is for the web testing surface only. The default MCP server runs over stdio on the user's machine and does not need or use an MCP API key. The user still needs local database access, and destructive MCP actions still require explicit user approval.

## `/api-docs` and `/api-docs/openapi.json` follow testing-surface readiness

The Swagger UI page and generated OpenAPI JSON are only available when the database is configured/reachable and `ENABLE_TESTING_SURFACE=true`. Otherwise `/api-docs` shows the same database setup, connection-error, or disabled-mode instructions as the rest of the testing UI, and `/api-docs/openapi.json` returns the same JSON readiness errors.

The spec still only describes API shape — paths, request/response schemas, and the `bearerAuth` security scheme. Do not add real data, example responses containing live content, or secrets to `@swagger` annotations.

### OpenAPI surface boundary

Only document the testing/client HTTP surface in Swagger: chat, feedback capture, approved read-only context/collections/harness display, document downloads, and local Ollama setup helper routes. Keep `/api/rag/harness` documented because the testing UI reads the approved assistant identity/capabilities/restrictions from it. Keep `/api/ollama/*` documented because local users need setup controls, but describe them as local testing helpers, not production client integrations. Do not add MCP-only workflows to OpenAPI: knowledge creation/update/archive, harness proposal/review, feedback review/resolution, eval creation, or anything that exposes drafts/rejected records/all statuses.

## `POST /api/ollama/start` executes a process — scoped deliberately

This route runs a fixed, hardcoded command (`ollama serve`, no user input reaches it) to let the chat UI's "Connect to Ollama" button start a local model server for the person using the app. This is the one place in `app/` that executes anything on the host machine, so it carries extra guardrails:

- It refuses to run unless **both** `OLLAMA_URL` resolves to `localhost`/`127.0.0.1`/`::1` **and** `NODE_ENV !== "production"` (checked together in `lib/ollama.ts`'s `canAutoStartOllama()`). A production build always has this disabled, regardless of `OLLAMA_URL`, specifically so a deployed instance can never have a visitor's request trigger process execution on the host.
- The command is a fixed string, never built from request input — there is no injection surface.
- It never targets any machine other than the one the Next.js server process is already running on. There is no way to make it start Ollama "somewhere else."

If you ever extend this pattern (e.g. supporting other model runtimes), keep both guardrails and never let request data influence the command that gets spawned.

## `POST /api/ollama/pull` downloads a model — scoped the same way, plus an allowlist

This route lets the chat UI's "Download model" button pull a model into Ollama. It's not a process spawn (it proxies an HTTP request to Ollama's own `/api/pull`), but it's still resource-consuming — bandwidth and disk, potentially several gigabytes — so it carries the same guardrails as `/api/ollama/start`, plus one more:

- Same `canAutoStartOllama()` gate: local `OLLAMA_URL`, non-production. A deployed instance can never have a visitor's request trigger a multi-gigabyte download on the host.
- The requested `model` must be one of the fixed `AVAILABLE_MODELS` in `lib/ollama.ts` — an arbitrary client-supplied model name is refused with a `400`, never forwarded to Ollama. This caps what can be downloaded to a small, reviewed list, regardless of how the gate above is configured.

If you add more models to `AVAILABLE_MODELS`, that's the only place to do it — don't accept model names from request bodies without validating against it first.

## `POST /api/feedback` — the one narrow write path in the chat app, scoped on purpose

Every other route in `app/` is read-only; this is the single, deliberate exception (see [System Architecture](architecture.md#the-core-boundary-read-vs-write)). It exists so a user can react (thumbs up/down) to an answer in the chat UI without that requiring the MCP propose/approve workflow — recording an opinion about an already-approved answer isn't a knowledge-base change, and can't become one through this route:

- It can only call `prisma.ragFeedback.create(...)`. There is no code path from `app/api/feedback/route.ts` to `RagChunk`, `RagDocument`, `RagCollection`, or `HarnessRule` — adding one would be exactly the kind of write-path expansion the chat app's non-negotiable rule exists to prevent (see `CLAUDE.md`/`CODEX.md`/etc.'s "Non-negotiable rules").
- `rating` is validated against a hardcoded allowlist (`GOOD`/`BAD` only, a subset of the full `RagFeedbackRating` enum) — an arbitrary client-supplied string is refused with a `400`, the same "validate against a fixed list, never trust the request body" pattern used for `model` in `/api/chat` and `/api/ollama/pull`.
- `question`/`answer` text is length-capped before storage (`MAX_TEXT_LENGTH`) — this is a lightweight reaction record, not a place for unbounded user input to accumulate.
- The shared testing API gate applies here too: if `APP_API_KEY` is configured, this route requires `Authorization: Bearer <key>` before it can create the feedback row.
- Feedback submitted here and feedback submitted through the MCP server's `add_feedback` tool land in the same `RagFeedback` table and are read the same way — this route doesn't create a second, divergent feedback mechanism, it's just a second entry point into the one that already existed.

## Automated PR security review

[`.github/workflows/security-review.yml`](../.github/workflows/security-review.yml) runs [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) on every pull request. It analyzes the diff for vulnerabilities and leaves PR comments; it does not block merges by default and does not write to the knowledge base or touch `DATABASE_URL`.

Requires a repository secret named `CLAUDE_API_KEY` (Settings → Secrets and variables → Actions in GitHub) — an Anthropic API key enabled for both the Claude API and Claude Code. Without it, the workflow will run but the security-review step will fail. `generated/`, `node_modules/`, and `.next/` are excluded from scanning since they're build output, not source you wrote.
