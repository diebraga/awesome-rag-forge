# System Architecture

## The core boundary: read vs. write

This project has exactly one read path and exactly one write path, and they are different components:

| | Chat application (`app/`) | MCP server (`mcp/rag-manager`) |
| --- | --- | --- |
| Role | Read-only RAG viewer | Exclusive knowledge & harness manager |
| Purpose | Test retrieval, answer questions, demonstrate the current knowledge base | Propose, review, and persist knowledge and harness rule changes |
| Can create collections/documents/chunks? | **No** | Yes, after approval |
| Can approve/reject/archive? | **No** | Yes |
| Can change harness capabilities/restrictions? | **No** | Yes, after propose → approve → human review |
| Can delete anything? | **No** | No delete tools are exposed yet either — see [MCP Server](mcp-server.md) |
| Reads from DB? | Yes — `APPROVED` chunks/documents/harness rules only | Yes — all statuses, for review and search |
| Writes to DB? | **Never** | Yes, exclusively through propose → approve workflows |

The chat app has no MCP client, no write-capable Prisma calls, and no tool-calling loop — it is a plain request/response chat backed by [`lib/rag/retrieval.ts`](../lib/rag/retrieval.ts). There is nothing in `app/` that is capable of mutating `RagCollection`, `RagDocument`, `RagChunk`, `RagSource`, `RagReview`, `RagFeedback`, `RagEvalCase`, or `HarnessRule`. All mutation logic lives in `mcp/rag-manager/server.ts`, run as a separate process.

One narrow exception exists outside the database entirely: `POST /api/ollama/start` can launch the Ollama process itself, so the chat UI's "Connect to Ollama" button works without a terminal. It's not a knowledge-base write — it never touches Prisma — and it's locked to local dev only (see [Security Considerations](security.md#post-apiollamastart-executes-a-process--scoped-deliberately)).

## `lib/rag/` — where all RAG and harness logic lives

RAG-domain logic is centralized under `lib/rag/`, separate from generic infrastructure (`lib/prisma.ts`, `lib/storage.ts`, `lib/ollama.ts`, `lib/utils.ts`):

```text
lib/rag/
  retrieval.ts     getRagContext() — approved-chunk text search, read-only
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

**The Collections pages (`app/collections/`) are a third case, not an exception.** They're a plain, `APPROVED`-only browsing view of collections/documents/chunks — part of the same read-only, end-user-facing surface as the chat, backed by their own read-only module (`lib/rag/collections.ts`) rather than `chat-context.ts`. They deliberately *do* show collection/document names — that's the point of the feature — which is not a contradiction of the chat's "never narrate structure" rule, because that rule is about the chat's conversational behavior specifically, not about every read-only surface in `app/`. Both stay within the same boundary that matters: `APPROVED`-only, no write path.

An earlier version of this feature rendered collections as a node graph (`@xyflow/react`). It was removed in favor of a plain list once it became clear a graph adds no value with only a handful of collections — don't re-add graph/visualization complexity without a concrete reason (e.g. the knowledge base growing large enough that a visual overview earns its keep, or real embedding-based clustering — see [RAG Architecture](rag.md)).

**The Harness page (`app/harness/`) is the same pattern applied to identity/harness data instead of knowledge.** It reads `getAssistantConfig()` (from `chat-context.ts`) and `getApprovedHarnessRules()` (from `harness.ts`) directly and renders them as a plain list — no graph, since there's no structure to visualize, just a handful of strings. Same audience, same `APPROVED`-only rule, same "read-only, no write path" boundary as everything else in `app/`.

Deliberately excluded from both pages: `RagReview` (approval/rejection audit trail), `RagFeedback` (user-submitted ratings/comments that were never reviewed for display), and `RagEvalCase` (testing artifacts). Those are creator/operational concerns — if you ever build a view for them, it belongs behind the MCP server's tools (`list_pending_reviews`, etc.), not on this read-only, end-user-facing surface.

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

The chat route calls `buildAssistantContext()` to get a single assembled system prompt (identity + read-only rules + harness capabilities/restrictions + knowledge-base scope) plus the retrieved chunks, then calls Ollama's `/api/chat`. Only chunks, documents, and harness rules with `status: APPROVED` are ever read here, and nothing in this path issues a write query. See [API Routes](api-routes.md) for the full route contract.

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
3. The user reviews the proposal and approves it.
4. The assistant calls `approve_source_insert` with `userApproval: true`, which creates a document and chunks with `status: PENDING_REVIEW`.
5. A human reviewer calls `approve_chunk` (or `reject_chunk`) via the assistant.
6. Approved chunks become visible to the chat app's RAG context on the next chat request — read-only, no action required on the chat app's side.

**Harness rules** (same shape, one extra review stage since these define behavioral boundaries, not just content):
1. A user asks the assistant to add a capability or restriction.
2. The assistant calls `propose_harness_update`, which validates the request against a hardcoded blocklist (see [MCP Server](mcp-server.md#harness-rules-propose--approve--review)) and returns a structured proposal — or a refusal — without touching the database.
3. The user reviews and approves.
4. The assistant calls `approve_harness_update` with `userApproval: true`, which re-validates and writes the rule as `PENDING_REVIEW`.
5. A human reviewer calls `approve_harness_rule` (or `reject_harness_rule`).
6. Approved rules appear in the system prompt of any connected agent on the next request.

## Two separate Prisma clients

- `lib/prisma.ts` — used by the Next.js app (server components/routes only, never in browser code). Only ever called with read queries in this codebase; keep it that way.
- `mcp/rag-manager/prisma.ts` — used by the MCP server process. This is the only Prisma client in the repo that should issue write queries.

Both point at the same `DATABASE_URL` and the same generated Prisma client (`generated/prisma`), but they run in separate processes.

See also: [Database & Prisma](database.md), [RAG Architecture](rag.md), [API Routes](api-routes.md), [MCP Server](mcp-server.md).
