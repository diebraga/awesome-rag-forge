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
