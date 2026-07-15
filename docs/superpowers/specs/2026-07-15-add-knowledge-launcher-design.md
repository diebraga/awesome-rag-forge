# Add Knowledge Launcher — Design

**Status:** Approved via conversation (2026-07-15). Design was worked out interactively across the whole conversation rather than a fresh Q&A pass; this doc is the synthesis, written and self-reviewed per the brainstorming skill's documentation step.

## Problem

Adding knowledge to the RAG today means manually opening a terminal, `cd`-ing into the repo, and typing a CLI invocation, then separately locating files to hand it. The user wants a single "Add Knowledge" action in the app that: stages the files they pick, opens a terminal with an AI CLI (their choice) already `cd`'d into the repo and primed with a prompt referencing those files, and degrades gracefully — with a one-click install path — when the chosen CLI isn't installed.

This deliberately does **not** build an in-app chat/LLM integration. It reuses the CLI tools that already have MCP wired up (per `docs/mcp-server.md`), so no LLM API key ever needs to live in the app.

## Supported providers

Only the three that are real terminal CLIs (not editor integrations):

| id | label | binary | install command |
|----|-------|--------|------------------|
| `claude` | Claude Code | `claude` | `npm install -g @anthropic-ai/claude-code` |
| `codex` | Codex CLI | `codex` | `npm install -g @openai/codex` |
| `gemini` | Gemini CLI | `gemini` | `npm install -g @google/gemini-cli` |

## Flow

1. User clicks **Add Knowledge** in the header (next to Disconnect).
2. A small popover opens: a provider dropdown (defaults to the last choice, persisted in `localStorage`; falls back to `claude`) and a native multi-file picker (`<input type="file" multiple>` — no Tauri plugin needed, since we only need file *contents*, not filesystem paths).
3. On submit, the selected files' contents are POSTed to a local-only API route, which:
   - Writes each file into `.rag-inbox/` at the repo root (gitignored staging folder; overwrites same-named files — last write wins, matching how the browser file picker would ovewrite it anyway).
   - Checks whether the chosen provider's binary is on `PATH` (`command -v <binary>`).
   - **If found:** opens Terminal.app (macOS, AppleScript, same pattern as the deleted `lib/setup-terminal.ts`), `cd`s into the repo, and runs `<binary> "Add the files in .rag-inbox/ to the knowledge base."`.
   - **If missing:** opens Terminal.app with `cd <repo> && <installCommand>` typed in (not auto-run beyond that — the install itself needs the user present to watch for prompts/errors). No knowledge prompt is queued for this run; the user re-clicks Add Knowledge once install finishes.
4. The popover closes; a toast/inline note confirms "Terminal opened" or reports the specific failure (no Terminal.app / not macOS / not connected).

## Reused / new pieces

- **Escaping helpers** (`shellQuoteSingleArg`, `appleScriptQuoteString`) — lifted from the deleted `lib/setup-terminal.ts` (git history, commit `57b1e27`), which already fixed the JSON.stringify-in-AppleScript bug. Ported into a new `lib/provider-terminal.ts`, generalized to accept an arbitrary shell command instead of hardcoding `npm run setup`.
- **Availability gate** — same shape as `canOpenSetupTerminal()`: macOS only, never in production (this is a local dev/desktop feature; production never ships `app/api` per `docs/deployment.md`).
- **Local-request guard** — the new API route reuses the existing `getLocalRequestFailure()` from `lib/local-request-guard.ts`, same as the Ollama helper routes.
- **New:** `lib/cli-providers.ts` — the provider table above plus `isProviderAvailable(binary)` (spawns `command -v <binary>` via `/bin/sh -c`).
- **New:** `lib/rag-inbox.ts` — `writeToInbox(files: {name, content}[])`, writes under `<repo>/.rag-inbox/`, creates the dir if missing.
- **New:** `app/api/knowledge/add/route.ts` — POST, multipart form data (`files[]`, `provider`), orchestrates the above three and calls `openProviderTerminal(...)`.
- **New:** `components/add-knowledge-button.tsx` — client component, popover with file input + provider select, calls the route, surfaces errors inline (not a silent failure).
- **New:** `.rag-inbox/` added to `.gitignore`.
- **Modified:** `components/header.tsx` — renders `<AddKnowledgeButton />` next to the Disconnect button, same visibility as Disconnect (only when the database is connected — header itself only renders in that state per `app/layout.tsx`).

## Error handling

- Not macOS / production build → route returns `{ ok: false, error }`, button shows the message inline (mirrors `SETUP_TERMINAL_UNAVAILABLE_ERROR`'s wording, generalized).
- Non-local request → 403 via `getLocalRequestFailure()`, same as existing local routes.
- No files selected → client-side validation, submit disabled.
- `osascript` failure (e.g. Terminal.app unavailable) → route returns `{ ok: false, error: "Unable to open a terminal window." }`.

## Out of scope (explicitly, per YAGNI)

- No in-app chat/LLM integration.
- No automatic/silent CLI install (user watches and drives the install in the opened terminal).
- No per-collection targeting UI — the user names the collection/harness target in their prompt to the CLI, since the CLI already has full MCP tool access.
- No Windows/Linux terminal support (matches the existing macOS-only precedent from the deleted setup-terminal flow; `canOpenSetupTerminal`'s doc comment already established this boundary).
- No dragging more files into an already-open terminal session — re-click Add Knowledge to stage more.
