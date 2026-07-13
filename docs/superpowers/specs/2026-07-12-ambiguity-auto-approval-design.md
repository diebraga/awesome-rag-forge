# Ambiguity-scored review triage design

## Context

`awesome-rag-forge` is a local-first RAG knowledge-base builder. The MCP server owns all knowledge and harness writes; the Next.js app remains a read-only testing surface except for narrow feedback capture. New knowledge must be captured and organized without being silently trusted by chat retrieval.

This design intentionally rejects automatic approval. Confidence scores, heuristics, and model self-assessment may prioritize review, but they must not move new knowledge or harness rules directly to `APPROVED`.

## Approved behavior

When a user adds knowledge through MCP, the system should:

1. Parse, clean, chunk, and organize the source.
2. Compare it with nearby existing knowledge for duplicate/update/related-document signals.
3. Detect review risk such as extraction warnings, missing classification, possible contradictions, duplicate candidates, or update candidates.
4. Save the approved proposal as `PENDING_REVIEW`.
5. Store review triage metadata so a human or `/review` dashboard can see why the item needs attention.
6. Keep the item out of chat retrieval until a human explicitly approves the relevant chunks.

Clean-looking additions can be marked `READY_FOR_BATCH_APPROVAL`, but that is only a queue recommendation. It does not make the content trusted or visible to chat.

## Review triage vocabulary

- `READY_FOR_BATCH_APPROVAL`: no obvious duplicate, update, contradiction, OCR, or classification warning. Reviewer may batch approve after a quick spot check.
- `NEEDS_REVIEW`: source is saved but has warnings, related-document ambiguity, OCR risk, missing classification, or other medium-risk signals.
- `CONFLICTS_WITH_APPROVED`: source may contradict or replace existing approved knowledge. Review first and decide whether to update, version, merge, or reject.
- `DUPLICATE_OR_UPDATE_CANDIDATE`: source strongly overlaps existing knowledge or matches an existing fingerprint. Review before approving another copy.

Every triage result includes confidence, priority, summary, reasons, recommended action, and `trustedUseBlocked: true`.

## Non-negotiable safety rules

- Do not add an auto-approval path for RAG content.
- Do not add an auto-approval path for harness rules.
- Do not let the chat, public APIs, collections, or harness viewer write RAG knowledge, harness rules, review decisions, or archive/delete operations through Prisma. The only approved exception is the local-only `/review` dashboard, guarded by `lib/local-review-guard.ts`.
- Do not expose drafts, rejected records, or review queues through public client APIs.
- Destructive MCP actions still require explicit user approval.
- Harness validation in `lib/rag/harness.ts` remains hardcoded and cannot be bypassed by confidence scores.

## Review dashboard

The `/review` dashboard is a local-only direct database review surface. It reads pending chunks and pending harness rules with Prisma and uses server actions for approve/reject decisions. Those actions must call `assertLocalReviewMode()` so they only run when `ENABLE_TESTING_SURFACE=true` and the app is not in a public/production runtime. The page is not an MCP client, does not use `MCP_AUTH_TOKEN`, and must not be expanded into a hosted admin panel or public client API.
