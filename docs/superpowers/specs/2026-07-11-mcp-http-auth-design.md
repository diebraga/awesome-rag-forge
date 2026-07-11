# MCP HTTP transport authentication

## Context

`mcp/rag-manager/http.ts` runs the same MCP server (`server.ts`) as the default stdio transport, but over `StreamableHTTPServerTransport` on `http://127.0.0.1:3200/mcp`, for clients that can't spawn a stdio subprocess (e.g. a future web-based review dashboard). It has full read/write access to the knowledge base and harness config — the same privilege level as any MCP client, since it's the same tool set.

Today this transport has **no authentication**. It's bound to loopback (`127.0.0.1`) by default, which limits exposure to processes on the same machine, but loopback binding alone doesn't stop a malicious webpage's JS from reaching `localhost:3200` via `fetch()` — a known attack class against unauthenticated local dev servers. `docs/security.md` and `docs/mcp-server.md` both flag this explicitly as a gap to close before anyone widens the bind address, but no auth mechanism exists yet.

Reusing the existing `APP_API_KEY` (which guards the read-only Next.js testing surface) was considered and rejected: `APP_API_KEY` and MCP write access protect very different privilege levels. If they shared a credential, a leak of the lower-stakes testing key — which some users intentionally expose when testing surface goes public — would also compromise full knowledge-base write access. Credential isolation by privilege level is the deciding factor.

## Decision

A dedicated, locally auto-generated token: `MCP_AUTH_TOKEN`.

### Generation and storage

- On `http.ts` startup, if `process.env.MCP_AUTH_TOKEN` is unset:
  - Generate `crypto.randomBytes(32).toString("hex")` (256-bit token, 64 hex chars).
  - Append `MCP_AUTH_TOKEN="<token>"` to `.env` (create the file if missing — mirrors how the project already treats `.env` as the single source of local config).
  - Set `process.env.MCP_AUTH_TOKEN` in-memory for the current process so the same run enforces it immediately.
  - Print the token to stderr exactly once, with the exact header format a client must send (`Authorization: Bearer <token>`), so a human can copy it into their MCP client's config.
- If appending to `.env` fails (permissions, read-only filesystem, etc.): log a clear warning that the token won't persist across restarts, but still use the in-memory value for the current run rather than falling back to no auth.
- This is not "fabricating a secret" in the sense `CLAUDE.md` prohibits (that rule targets provider-issued secrets like `DATABASE_URL`/S3 keys that require a real external account) — this token has no external issuer; its only job is letting a local MCP client authenticate to this local server, the same category as e.g. Jupyter's local token auth.

### Enforcement

- Every request to `/mcp` must carry `Authorization: Bearer <token>`.
- Implemented as a small, local, pure function in `mcp/rag-manager/` (not imported from `lib/testing-api-auth.ts`) — `docs/coding-standards.md` keeps the MCP server from importing app infrastructure, and the two live on different HTTP runtimes anyway (`Request`/`NextResponse` vs. Node's `IncomingMessage`/`ServerResponse`). Duplicating ~15 lines of timing-safe bearer-token comparison is the right call here, not a shared util.
- Missing or invalid token → `401` with a `WWW-Authenticate: Bearer` header, checked **before** `transport.handleRequest` is ever called — the MCP transport itself never sees an unauthenticated request.
- This makes the transport fail-closed by default: since a token is always generated on first run, there is no code path where the server listens without requiring one (short of a user manually unsetting `MCP_AUTH_TOKEN` after it was already generated, which is on them).

### Out of scope

- The default **stdio transport is untouched**. Its trust boundary is "whoever can spawn the child process" (the MCP client itself), which this change doesn't affect and doesn't need to.
- No change to `APP_API_KEY` or the Next.js testing surface.
- No token rotation/expiry mechanism — this is a local dev/single-operator tool, not a multi-tenant service. Rotation is: delete the line from `.env`, restart, a new token generates.

## Files touched

- `mcp/rag-manager/http.ts` — token generation-on-first-run, and the auth check before `transport.handleRequest`.
- `mcp/rag-manager/http-auth.ts` (new) — pure, unit-testable helper: extracts the bearer token from headers, timing-safe compares it, returns a pass/fail + reason.
- `mcp/rag-manager/http-auth.test.ts` (new) — unit tests for the helper, following the existing `lib/rag/harness.test.ts` pattern.
- `.env.example` — document `MCP_AUTH_TOKEN` as auto-managed/optional-to-preset, alongside the existing `MCP_HTTP_HOST`/`MCP_HTTP_PORT` block.
- `docs/security.md` — replace the "there is no authentication on this transport" claim with the new mechanism.
- `docs/mcp-server.md` — HTTP transport section: describe first-run token generation, the header a client must send, and where to find the generated value.

## Testing

- Unit tests on the extracted `http-auth.ts` helper: valid token passes, missing header fails, wrong scheme (`Basic` instead of `Bearer`) fails, wrong token fails, empty token fails.
- Manual: start `npm run mcp:rag-manager:http` fresh (no `MCP_AUTH_TOKEN` in `.env`), confirm a token is generated, printed, and persisted; confirm a request without the header gets `401`; confirm a request with the correct header succeeds; restart and confirm the persisted token is reused (no second token generated).
