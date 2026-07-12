# Local secret onboarding (no secrets in chat)

## Context

Users were pasting `DATABASE_URL`, storage keys, and provider API keys directly into the AI assistant's chat so the assistant could add them to `.env`. That puts real secrets into a cloud-hosted conversation transcript — the wrong place for them, even for "just a test." The fix isn't a documented convention ("please don't paste secrets") — conventions can be talked around by simply telling the assistant to do it anyway. The fix has to be structural: secrets should never enter the assistant's context at all, and the mechanism preventing that shouldn't depend on the assistant's willingness in the moment.

## Decision

Replace "paste keys into chat" with a local script the user runs themselves, plus a permission-layer block on the assistant's own tools, plus a status-only verifier so the assistant can still confirm things work without ever seeing the values.

### 1. `scripts/setup-env.ts`

Interactive CLI, run via `npm run setup`. Asks one variable at a time, in this order: `DATABASE_URL` (required), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `APP_API_KEY`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`, `STORAGE_ENDPOINT` (all but `DATABASE_URL` optional — blank input skips). Input is masked (each keystroke echoes as `*`) using Node's stdlib `readline` with a custom output override — no new dependency. Each answer is upserted into `.env` (created if missing) immediately after entry, not batched at the end. Values are never echoed back, logged, or transmitted anywhere; the script's own stdout never prints a secret value.

Out of scope on purpose: non-secret config (`OLLAMA_URL`, `CHAT_PROVIDER`, `DEVELOPER_MODE`, `ENABLE_TESTING_SURFACE`, `MCP_HTTP_HOST/PORT`) already has safe defaults in `.env.example` and isn't sensitive — a user can edit those directly with a text editor if they ever want to change them.

### 2. `scripts/check-env.ts`

Status-only verifier, run via `npm run check:env`. Calls `getDatabaseConnectionStatus()` (already exists, `lib/database-health.ts`) and a new `getStorageConnectionStatus()` (added to `lib/storage.ts`, mirrors the existing pattern: `isStorageConfigured()` check, then a `HeadBucketCommand` via the already-instantiated S3 client — no new dependency, `@aws-sdk/client-s3` is already installed). Prints only `Database: connected` / `failed` and `Storage: connected` / `not configured` / `failed` — never the underlying URL or keys. This is the mechanism that lets the assistant confirm setup worked without ever reading `.env` itself.

### 3. The assistant's role: open the door, don't watch through it

When a user needs to configure secrets, the assistant tells them to run `npm run setup`, and where possible opens a **detached** terminal window for convenience:
- **macOS**: `osascript -e 'tell application "Terminal" to do script "cd <path> && npm run setup"'`. This spawns a separate Terminal.app window that is not a child process of the assistant's own tool call — the assistant's `osascript` invocation returns immediately after handing off, and never sees the interactive session's input or output.
- **Windows**: equivalent `start cmd /k "npm run setup"`.
- **Linux**: no single reliable terminal emulator to target blindly; the assistant just tells the user the command to run in a terminal they already have open. Documented as an honest gap, not silently degraded.

After the user says they're done, the assistant runs `npm run check:env` (via its own tool, since that script's output is safe-by-construction) and reports pass/fail. If the user says they haven't finished, the assistant offers to reopen the terminal or just repeats the instruction.

### 4. `.claude/settings.json` — a real tool-layer block, not a promise

Add a `permissions.deny` rule blocking the assistant's own `Read` tool and common `Bash` read patterns (`cat`, `less`, `head`, `tail`, `grep`) against `.env`. This is enforced by Claude Code's tool-permission layer *before* the assistant's request is fulfilled — the same category as the hardcoded identity/read-only rules elsewhere in this project that a prompt can't override.

Honest limit, stated in docs: `Bash` is a general-purpose shell, so a sufficiently indirect command (e.g. reading the file byte-by-byte through an unlisted tool) could still slip past a pattern-based deny list — this is defense-in-depth, not a cryptographic guarantee. The deny rule is paired with a plain behavioral commitment documented in the instruction files: the assistant does not intentionally read `.env` and only ever uses `check-env.ts` to verify configuration. For a genuinely unbypassable guarantee, the follow-up (not built now) would be storing secrets in the OS's native credential vault (Keychain/Credential Manager/keyring) with per-access user authorization — heavier to build, left as a documented future option.

### 5. Propagation

The rule "never read `.env` directly; use `npm run setup` to write secrets and `npm run check:env` to verify" gets added to the shared numbered setup-guidance list already duplicated across `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `.cursorrules` (each assistant's own entry point). `AGENTS.md` is out of scope — it only holds the unrelated Next.js-version caveat.

### 6. Docs

`docs/environment-variables.md`, `docs/development-workflow.md`, and `docs/security.md` get a short section describing the setup/check flow, why it exists (no secrets in chat transcripts), and the Bash-is-general-purpose limitation stated plainly.

## Testing

Unit test for `setup-env.ts`'s pure `upsertEnvVar(content, key, value)` function (append when missing, replace in place when present, preserve unrelated lines) — the one piece of non-trivial logic. No test needed for the interactive I/O itself or for `check-env.ts` (it's a thin composition of already-tested/existing functions).

## Out of scope

- OS-keychain-backed storage (documented as a future upgrade, not built now).
- Changing how the app itself reads `.env` (`dotenv/config` stays as-is).
- Any change to non-secret config vars.
