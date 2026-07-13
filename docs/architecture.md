# System Architecture

## The core boundary: read vs. write

This project keeps normal use and knowledge management separate. The default path is read-only chat/API, while knowledge creation and broad management belong to the MCP server. Narrow local-only browser exceptions exist for `/review` approvals and Collections archiving of already-approved visible knowledge.

| | Chat application (`app/`) | MCP server (`mcp/rag-manager`) |
| --- | --- | --- |
| Role | Read-only RAG viewer, plus local-only review dashboard | Exclusive knowledge & harness manager |
| Purpose | Test retrieval, answer questions, demonstrate approved knowledge; locally approve/reject pending review items | Propose, organize, persist, archive, and correct knowledge/harness changes |
| Can create collections/documents/chunks? | **No** | Yes, after approval |
| Can approve/reject/archive? | `/review` can approve/reject pending chunks and harness rules locally only; Collections can archive approved visible documents/chunks locally only | Yes |
| Can change harness capabilities/restrictions? | `/review` can approve/reject pending rules only | Yes, after propose → approve → human review |
| Can delete anything? | **No** | No delete tools are exposed yet either — see [MCP Server](mcp-server.md) |
| Reads from DB? | Normal UI: `APPROVED` + `EXTERNAL` + `CHAT`-visible only. `/review`: pending chunks/rules only | Yes — all statuses/audiences, for review and search |
| Writes to DB? | **`RagFeedback` in normal chat/UI; `/review` approve/reject actions; Collections archive actions** — all local/guarded where applicable (see below) | Yes, through propose → approve workflows |

The chat app has no MCP client and no tool-calling loop — it is a plain request/response chat backed by [`lib/rag/retrieval.ts`](../lib/rag/retrieval.ts). Normal end-user HTTP routes in `app/` cannot mutate `RagCollection`, `RagDocument`, `RagChunk`, `RagSource`, `RagReview`, `RagEvalCase`, or `HarnessRule`. `RagFeedback` is the one end-user exception, and it's deliberately narrow: `app/api/feedback/route.ts` can create a `RagFeedback` row (a thumbs up/down on an answer, from the chat UI) and nothing else — it has no code path to any other table. This exists because end-user reaction to an already-approved answer isn't a knowledge-base change; it doesn't need the propose/approve workflow because it can't affect what the assistant knows or does, only what gets recorded as feedback for a human to review later.

`/review` is a separate builder-only exception, not part of the chat surface and not an MCP client. It reads pending `RagChunk` and `HarnessRule` rows directly from Postgres and uses server actions to approve/reject them, guarded by `assertLocalReviewMode()` so it only works with `ENABLE_TESTING_SURFACE=true` outside production/public runtimes. The Collections detail page uses the same guard for one maintenance action: archiving an already-approved visible document or chunk after an explicit warning and reason. Do not turn either path into a public API, a Swagger-documented route, or a general admin panel.

Opening the browser does not connect the user to the MCP server. The browser UI and its HTTP routes are deliberately testing surfaces over approved data; they should not proxy MCP tools or become a browser-based MCP client. RAG and harness creation, organization, correction, archival, and file ingestion require a separate MCP-capable client configured to launch `npm run mcp:rag-manager` from this repository's local checkout. `/review` only handles the final local approval/rejection queue for pending chunks and harness rules.

One narrow exception exists outside the database entirely: `POST /api/ollama/start` can launch the Ollama process itself, so the chat UI's "Connect to Ollama" button works without a terminal. It never touches Prisma, and it's locked to local dev only (see [Security Considerations](security.md#post-apiollamastart-executes-a-process--scoped-deliberately)).

## `lib/rag/` — where all RAG and harness logic lives

RAG-domain logic is centralized under `lib/rag/`, separate from generic infrastructure (`lib/prisma.ts`, `lib/storage.ts`, `lib/ollama.ts`, `lib/utils.ts`):

```text
lib/rag/
  retrieval.ts     getRagContext() — approved hybrid semantic/lexical retrieval, read-only
  chat-context.ts   buildAssistantContext() — the ONLY definition of how the
                      test chat talks: identity, read-only rules, harness
                      rendering, anti-injection guard, and the rule that it
                      must never narrate its own structure
  harness.ts         shared, capability-neutral: rule validation and data
                      access only, used identically by the chat (read) and
                      the MCP server (write) — no chat-facing phrasing here
```

`lib/rag/harness.ts` in particular is imported by **both** sides on purpose: `mcp/rag-manager/server.ts` uses it (via a relative import, same pattern as `lib/storage.ts`) to validate and structure harness rule proposals before anything is written, and `lib/rag/chat-context.ts` uses it to read `APPROVED` rules back out for the system prompt. One shared module means the validation rules can't drift between the write side and the read side.

### Two audiences, kept apart on purpose

`lib/rag/chat-context.ts` and `mcp/rag-manager/server.ts` are not just gated differently on writes — they define behavior for two different audiences with two different disclosure rules, and neither should import the other's "how to talk" logic:

- **`lib/rag/chat-context.ts`** — the *entire* definition of how the end-user-facing test chat behaves. It computes knowledge-base stats internally but explicitly instructs the model never to recite them; the chat can search and answer from content, but it cannot describe its own structure (collection names, categories, counts), even if asked.
- **`mcp/rag-manager/server.ts`** — the *entire* definition of how the creator-facing MCP server behaves, entirely through each tool's own `description` (there's no single "MCP system prompt" — each tool carries its own instructions, which is the normal MCP idiom). `list_collections`/`list_documents`/`get_harness_rules` intentionally return full, named, structural data, because the person building the knowledge base needs it.

If you're adding a capability, ask which audience it's for before deciding where it goes: information for the knowledge base's creator belongs in an MCP tool; behavior for the person testing/using the chat belongs in `lib/rag/chat-context.ts`. Don't let the two mix.

**The Collections pages (`app/collections/`) are a third case, not an exception.** They are an `APPROVED`-only browsing view of collections/documents/chunks, backed by `lib/rag/collections.ts` rather than `chat-context.ts`. They deliberately *do* show collection/document names — that is the point of the feature — which is not a contradiction of the chat's "never narrate structure" rule, because that rule is about conversational behavior specifically. Collections also includes a local-only archive maintenance action for already-approved visible documents/chunks; it soft-archives rows with confirmation and reason, never hard-deletes rows, and never exposes drafts/rejected/internal knowledge.

An earlier version of this feature rendered collections as a node graph (`@xyflow/react`). It was removed in favor of a plain list once it became clear a graph adds no value with only a handful of collections — don't re-add graph/visualization complexity without a concrete reason (e.g. the knowledge base growing large enough that a visual overview earns its keep, or real embedding-based clustering — see [RAG Architecture](rag.md)).

**The Harness page (`app/harness/`) is the same pattern applied to identity/harness data instead of knowledge.** It reads `getAssistantConfig()` (from `chat-context.ts`) and `getApprovedHarnessRules()` (from `harness.ts`) directly and renders them as a plain list — no graph, since there's no structure to visualize, just a handful of strings. Same audience and same `APPROVED`-only rule as the chat/API read surfaces; unlike Collections, Harness has no maintenance write action.

Deliberately excluded from the chat, collections browsing, and harness end-user surfaces: `RagReview` (approval/rejection audit trail), `RagFeedback` (user-submitted ratings/comments that were never reviewed for display), and `RagEvalCase` (testing artifacts). Those are creator/operational concerns. The local-only `/review` page may show pending chunks and pending harness rules for approval, but it must stay outside the public/API surface and keep the production guard.

## Chat path (read-only)

```text
Browser chat UI (app/page.tsx)
        ↓
Next.js API route (app/api/chat/route.ts)
        ↓
lib/rag/chat-context.ts (buildAssistantContext) ──→ AssistantConfig (identity, read-only)
        ↓                                  ──→ lib/rag/retrieval.ts (approved chunks, read-only)
        ↓                                  ──→ lib/rag/harness.ts (approved capabilities/restrictions, read-only)
        ↓                                  ──→ knowledge-base stats (internal calibration only, never recited)
Ollama local model server
        ↓
Response rendered in the chat UI
```

The chat route calls `buildAssistantContext()` with the latest user question to get a single assembled system prompt (identity + read-only rules + harness capabilities/restrictions + knowledge-base scope) plus query-ranked retrieved chunks, then calls the selected chat provider. Only chunks/documents with `status: APPROVED`, `audience: EXTERNAL`, and `visibility` containing `CHAT` are ever read here; only approved harness rules scoped to `USER_CHAT` or `ALL` are rendered. Nothing in this path issues a write query. See [API Routes](api-routes.md) for the full route contract.

### Any agent, not just this chat

`buildAssistantContext()` in [`lib/rag/chat-context.ts`](../lib/rag/chat-context.ts) is the single, model-agnostic source of truth for identity, harness rules, and read-only behavior — it is not tied to Ollama or to this Next.js route. `GET /api/rag/context` exposes the same bundle over HTTP so a different LLM provider, a different app, or any other agent you connect later inherits the same name, the same instruction to never reveal the underlying model, the same configured capabilities/restrictions, and the same knowledge-base scope, without re-implementing any of this logic. See [API Routes](api-routes.md#get-apiragcontext).

## Knowledge & harness management path (the only write path)

```text
MCP client (Claude Desktop, Codex, etc.)
        ↓
mcp/rag-manager/server.ts  (stdio MCP server)
        ↓                              ↓
Prisma (mcp/rag-manager/prisma.ts)   lib/rag/harness.ts (validation, shared with the read side)
        ↓
Postgres (RagCollection, RagDocument, RagChunk, RagSource, RagReview, RagFeedback, RagEvalCase, HarnessRule)
```

The MCP server is the only place new knowledge or harness rules are proposed and written. Neither ever writes without an explicit approval step — see [MCP Server](mcp-server.md).

## Data flow summary

**Knowledge:**
1. A user (via an MCP client) asks the assistant to add a source.
2. The assistant calls `propose_source_insert`, which returns a proposal without touching the database.
3. The user reviews the proposal and approves the write.
4. The assistant calls `approve_source_insert` with `userApproval: true`. Clean knowledge is created as `APPROVED` and becomes available to retrieval immediately; ambiguous/problematic knowledge is created as `PENDING_REVIEW` with `reviewReason` metadata explaining why. New proposals infer audience/visibility from the source text and inherit it from an explicitly selected collection unless the user overrides it.
5. For items routed to review, a human reviewer calls `approve_chunk` (or `reject_chunk`) via the assistant or local `/review` UI.
6. Approved chunks become visible to the chat app's RAG context on the next chat request only when their document and collection are also `EXTERNAL` and `CHAT`-visible — read-only, no action required on the chat app's side.

**Harness rules** (same shape, one extra review stage since these define behavioral boundaries, not just content):
1. A user asks the assistant to add a capability or restriction.
2. The assistant calls `propose_harness_update`, which validates the request against a hardcoded blocklist (see [MCP Server](mcp-server.md#harness-rules-propose--approve--review)) and returns a structured proposal — or a refusal — without touching the database.
3. The user reviews and approves.
4. The assistant calls `approve_harness_update` with `userApproval: true`, which re-validates and writes the rule as `PENDING_REVIEW` with a scope (`USER_CHAT`, `OPERATOR_AGENT`, `MCP_AGENT`, or `ALL`).
5. A human reviewer calls `approve_harness_rule` (or `reject_harness_rule`).
6. Approved `USER_CHAT`/`ALL` rules appear in the chat system prompt on the next request; operator/MCP-scoped rules remain visible to management/review surfaces without changing the end-user chat.

## Two separate Prisma clients

- `lib/prisma.ts` — used by the Next.js app (server components/routes only, never in browser code). Only ever called with read queries in this codebase; keep it that way.
- `mcp/rag-manager/prisma.ts` — used by the MCP server process. This is the only Prisma client in the repo that should issue write queries.

Both point at the same `DATABASE_URL` and the same generated Prisma client (`generated/prisma`), but they run in separate processes.

See also: [Database & Prisma](database.md), [RAG Architecture](rag.md), [API Routes](api-routes.md), [MCP Server](mcp-server.md).
