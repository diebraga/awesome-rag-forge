# Ambiguity-scored auto-approval + review dashboard

## Context

`awesome-rag-forge` is a RAG knowledge-base builder with a strict rule enforced throughout the codebase and docs: the Next.js app (`app/`, `lib/`) is read-only and never writes knowledge; only the MCP server (`mcp/rag-manager`) writes, and only through a `propose_* → human approval → PENDING_REVIEW` flow. Today, `approve_source_insert` (and `approve_file_upload`, `approve_harness_update`, etc.) unconditionally write new content with `status: "PENDING_REVIEW"` — every single item requires an explicit human `approve_chunk`/`reject_chunk` (or `approve_harness_rule`/`reject_harness_rule`) call before it is ever visible to the chat. There is currently no ambiguity/confidence gate: `docs/security.md` states outright *"Do not add logic that auto-approves based on heuristics, confidence scores, or model self-assessment."*

This spec **intentionally and explicitly overrides that rule, scoped narrowly**: content the system judges non-ambiguous is written directly as `APPROVED`, with no human step. Content judged ambiguous still requires human review — surfaced through a new review dashboard, not a chat conversation with an LLM listing items one by one.

This override is deliberate project-owner intent, confirmed explicitly. Do not read it as license to weaken any other approval gate in this project (harness capability/restriction *validation* — the hardcoded blocklist/allowlist in `lib/rag/harness.ts` — is unaffected and still runs first, unconditionally, before any ambiguity scoring; a statement that fails that validation is refused outright regardless of any confidence score).

## Scope

Applies to **both**:
1. RAG knowledge insertion (`propose_source_insert` → `approve_source_insert`, and the file-upload equivalents `propose_file_upload(_batch)` → `approve_file_upload(_batch)`).
2. Harness rule proposals (`propose_harness_update` → `approve_harness_update`), for proposals that already pass `validateHarnessStatement`'s existing hardcoded blocklist/allowlist checks. Use a **stricter** auto-approval threshold here than for RAG content — wrong harness rules change the assistant's own behavior across every client, higher blast radius than one wrong fact.

Does **not** apply to: `propose_chunk_update`/`approve_chunk_update` (edits to existing approved chunks) — leave that flow exactly as-is (still always resets to `PENDING_REVIEW`, still always human-gated). This spec covers *new* insertions only. If you think it should also cover edits, stop and ask before extending scope.

## 1. Ambiguity scoring for RAG content

Add a new step inside `propose_source_insert`'s handler (`mcp/rag-manager/server.ts` and `mcp/rag-manager/proposal.ts`), after the existing chunk-plan/placement-review logic, before returning the proposal to the caller:

- **Contradiction check**: run the new content against `lib/rag/retrieval.ts`'s existing hybrid retrieval (already built) scoped to `status: APPROVED` chunks, looking for existing approved content that covers the same entity/topic. If the new content conflicts with (rather than merely relates to) an approved fact, force ambiguous (do not auto-approve, regardless of score below).
- **Extraction/source quality signal**: if `proposal.warnings` (existing field) is non-empty — e.g. "no category or domain was provided," "did not split cleanly into paragraphs," OCR/extraction warnings — that counts against auto-approval.
- **New field `autoApprovalConfidence: number` (0–1)** on the proposal schema (`proposal.ts`), distinct from the existing `confidence` field (which is about *placement* — which collection to file into — a different axis). Computed by the same reasoning step that builds the proposal: how confident is the assistant that this content is factually clean, well-sourced, non-contradictory, and safe to trust without a human reading it.
- **New field `autoApprovalReasoning: string`** — a short human-readable explanation, always populated (used either as "why I auto-approved this" in the audit log, or "why this needs your review" in the dashboard).
- **Threshold constant** (new file, e.g. `mcp/rag-manager/ambiguity.ts`): `RAG_AUTO_APPROVE_THRESHOLD = 0.9`. Auto-approve only if `autoApprovalConfidence >= threshold` AND no contradiction was found AND `warnings` is empty.

## 2. Ambiguity scoring for harness rules

Same pattern inside `propose_harness_update`'s handler:

- The existing hardcoded `validateHarnessStatement` blocklist/allowlist check in `lib/rag/harness.ts` runs first, unchanged. A statement it refuses is refused — full stop, no ambiguity score can override this.
- For statements that pass validation, add `autoApprovalConfidence`/`autoApprovalReasoning` the same way: how cleanly does this match an established, already-approved safe capability/restriction pattern, versus being a novel or borderline phrasing.
- **Stricter threshold constant**: `HARNESS_AUTO_APPROVE_THRESHOLD = 0.97` (higher than RAG's 0.9 — deliberate, given the higher blast radius of an auto-approved bad harness rule).

## 3. Auto-approval write path

In `approve_source_insert`'s transaction (`mcp/rag-manager/server.ts`, currently writes `status: "PENDING_REVIEW"` unconditionally — see the existing `RagDocument.create`/`RagChunk.create` calls): branch on the computed `autoApprovalConfidence` against the threshold.

- **Above threshold**: write `status: "APPROVED"` directly (both document and chunk), generate the embedding immediately (reuse the existing `embedChunkForApproval`/`storeChunkEmbedding` helpers already called from `approve_chunk` today — don't duplicate that logic, extract it into a shared function both `approve_chunk` and this new auto-approval path call), and write the audit record described in section 4.
- **At or below threshold**: unchanged — write `status: "PENDING_REVIEW"` exactly as today, but persist `autoApprovalConfidence`/`autoApprovalReasoning` into the chunk/document's existing `metadata: Json?` field so the review dashboard can display them.

Mirror the same branch in `approve_harness_update` against `HarnessRule.status`.

## 4. Audit trail for auto-approved items

Auto-approval must still be traceable — this is not "silently skip the record," it's "skip the human, keep the paper trail."

- For RAG content: still create a `RagReview` row (existing table), with `reviewer: "system:ambiguity-classifier"` (a clear sentinel value, never confusable with a real human reviewer name) and `notes` containing the `autoApprovalConfidence` score and `autoApprovalReasoning`.
- For harness rules: `HarnessRule` already has `reviewer`/`reviewNotes`/`reviewedAt` fields directly on the model (no separate review-log table) — populate them the same way: `reviewer: "system:ambiguity-classifier"`, `reviewNotes` containing the score and reasoning.

## 5. Review dashboard — new page, reachable from the header

**Critical architectural constraint, do not violate it:** the Next.js chat app (`app/`) must never gain a new Prisma write path. `CLAUDE.md`'s first non-negotiable rule is exactly this. A page with Approve/Reject buttons that calls a new Next.js API route which writes to Prisma directly would violate that rule.

**The correct mechanism, already anticipated in this project's own docs** (`docs/mcp-server.md`: *"HTTP transport (for a web-based client, e.g. a future review dashboard)"*): this new page is a **client of the MCP HTTP transport**, not a new write route in the read-only app.

- New page `app/review/page.tsx`, added to `components/header.tsx`'s nav list (same pattern as the existing `/collections`, `/harness`, `/schema` links).
- The page lists items with `status: "PENDING_REVIEW"` (both RAG chunks/documents and harness rules — tabs or sections for each) by calling the MCP server's `list_pending_reviews` and `get_harness_rules` (filtered to `PENDING_REVIEW`) tools **over the MCP HTTP transport** (`http://{MCP_HTTP_HOST}:{MCP_HTTP_PORT}/mcp`, default `127.0.0.1:3200`), authenticated with `MCP_AUTH_TOKEN` (already built this session, see `mcp/rag-manager/http-auth.ts`) via `Authorization: Bearer <token>`.
- Each item displays: its content/statement, the stored `autoApprovalConfidence`/`autoApprovalReasoning` (why the system thinks this one needs a human), and two buttons: **Approve** / **Reject**.
- Clicking a button calls the MCP HTTP transport's `approve_chunk`/`reject_chunk` or `approve_harness_rule`/`reject_harness_rule` tool directly — the actual database write still happens exactly where it always has, inside `mcp/rag-manager/server.ts`'s existing tool handlers. The Next.js app only ever proxies an authenticated MCP tool call; it never touches Prisma for this.
- Requires the user to have `npm run mcp:rag-manager:http` running (document this clearly on the page itself — e.g. an empty/error state saying "MCP HTTP transport not reachable, start it with `npm run mcp:rag-manager:http`" rather than a silent failure).
- Gate this page behind `ENABLE_TESTING_SURFACE` the same as `/collections`/`/harness`/`/schema` (it's a testing/review surface for the person running this locally, same trust level as the rest of the testing UI) — but it is **not** exempt from needing the MCP HTTP transport up and authenticated; that's a separate, additional requirement on top of the testing-surface gate.

## 6. What this does NOT change

- `POST /api/feedback` remains the only write path in the chat app itself — unchanged.
- The harness capability/restriction *validation* (blocklist/allowlist in `lib/rag/harness.ts`) is unaffected — it runs before any ambiguity scoring and its refusals cannot be overridden by a confidence score.
- `propose_chunk_update`/`approve_chunk_update` (edits to existing chunks) are unaffected — always resets to `PENDING_REVIEW`, always human-gated, no auto-approval path.
- The MCP stdio transport and its existing tools are unaffected in behavior/signature — this only changes what happens inside `approve_source_insert`/`approve_harness_update`'s handlers and adds two new fields to the proposal schema.

## Files touched

- `mcp/rag-manager/ambiguity.ts` (new) — threshold constants, shared scoring helper types.
- `mcp/rag-manager/proposal.ts` — add `autoApprovalConfidence`/`autoApprovalReasoning` to the proposal schema and to `buildSourceProposal`/`buildHarnessProposal`(-equivalent) construction.
- `mcp/rag-manager/server.ts` — branch in `approve_source_insert`, `approve_file_upload(_batch)`, and `approve_harness_update` handlers; extract the embedding-on-approval logic (currently inline in `approve_chunk`) into a shared function both the manual and auto-approval paths call.
- `lib/rag/retrieval.ts` — expose (or reuse) a function suitable for the contradiction check against existing `APPROVED` content.
- `app/review/page.tsx` (new), plus a client component for the MCP HTTP calls (mirroring the `swagger-ui-loader.tsx` client/server split pattern already used in `app/api-docs/`).
- `components/header.tsx` — add the nav link.
- `docs/rag.md`, `docs/security.md`, `docs/mcp-server.md` — document the new auto-approval behavior, its thresholds, and the review dashboard, replacing the now-narrowed "no automatic approval" language with the scoped exception this spec describes.

## Testing

- Unit tests for the threshold/branch logic (`mcp/rag-manager/ambiguity.ts` and the branching in `proposal.ts`): confidence above/at/below threshold, contradiction-found forces ambiguous regardless of score, non-empty warnings forces ambiguous regardless of score.
- Unit test confirming a harness statement that fails `validateHarnessStatement` is refused regardless of any confidence score (i.e., the hardcoded validation still runs first and cannot be bypassed).
- Manual: propose a source with clearly non-contradictory, clean content and confirm it lands as `APPROVED` with a `RagReview` row showing `reviewer: "system:ambiguity-classifier"`. Propose something contradicting existing approved content and confirm it lands as `PENDING_REVIEW` with the reasoning visible. Load `/review` with the MCP HTTP transport running and confirm Approve/Reject actually mutate state via the MCP tools (verify with `list_pending_reviews` before/after).

## Open questions for whoever implements this (resolve before or during implementation, not silently)

- Exact wording/UX of the "MCP HTTP transport not reachable" empty state on `/review`.
- Whether `/review` needs pagination beyond `list_pending_reviews`'s existing `limit` parameter for very large pending queues.
- Whether the contradiction check should block auto-approval on *any* semantic overlap with lower similarity, or only on high-similarity contradictions — tune against false-positive rate during manual testing rather than guessing a number up front.
