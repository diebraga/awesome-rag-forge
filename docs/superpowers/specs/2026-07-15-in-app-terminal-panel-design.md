# In-App Terminal Panel — Design

**Status:** Approved via conversation (2026-07-15). Design worked out interactively; this doc is the synthesis, written per the brainstorming skill's documentation step.

## Problem

The "Add Knowledge" launcher (built earlier this session) opens an *external* `Terminal.app` window via `osascript`. The user wants this replaced entirely: a real, interactive terminal embedded inside the Tauri window itself, sliding in from the left with a smooth open/close animation, running Claude Code/Codex/Gemini CLI to add knowledge and install the MCP server registration — nothing else. A composer bar at the bottom lets the user attach files (like a chat attachment tray) and send a message that both stages the files and types the combined message into the live session.

This is a Tauri-only feature: it requires a real PTY (pseudo-terminal), which only exists inside the native shell, not a plain browser tab. That's fine — production never ships `app/api` publicly (see `docs/deployment.md`), and this panel only makes sense running inside the Tauri window anyway.

## Why a real PTY (not piped stdout)

Claude Code, Codex CLI, and Gemini CLI are interactive TUIs — they need real keyboard input, ANSI control sequences, and terminal resizing, not just a stream of stdout text. A plain `child_process.spawn()` with piped stdout (Node) can't provide that. The standard pairing for this is a native PTY on the Rust side (`portable-pty`) plus a terminal emulator in the frontend (`xterm.js`) that renders PTY output and forwards keystrokes back.

## What gets removed

The whole external-terminal code path is replaced, not kept alongside:

- `lib/provider-terminal.ts` + its test — the AppleScript/shell-quoting approach is no longer needed. `portable-pty`'s `CommandBuilder` takes a program + argv array directly, so there's no shell string to construct or quote at all (no more `shellQuoteSingleArg`/`appleScriptQuoteString` — that entire class of escaping bug goes away with the approach, not just gets fixed again).
- `app/api/knowledge/add/route.ts` — replaced by two smaller routes (below).
- `components/add-knowledge-button.tsx` — replaced by the new panel component.

`lib/cli-providers.ts` (provider table, `isCliAvailable`) and `lib/rag-inbox.ts` (file staging) are reused as-is — both are still correct for the new design.

## Architecture

**Rust side (`src-tauri/`):** new `portable-pty` dependency, new `src/pty.rs` module with four Tauri commands, state-managed via `tauri::State`:

- `spawn_pty(program, args, cwd)` — opens a PTY, spawns `program` with `args` in `cwd`, spawns a background thread that reads PTY output and emits it as a `pty-output` event (chunked, as it arrives). Emits `pty-exit` when the process ends.
- `write_pty(data)` — writes a string into the PTY's stdin (used both for direct typing and for the composer's "send message" action).
- `resize_pty(rows, cols)` — keeps the PTY's size in sync with the panel's rendered size.
- `kill_pty()` — kills the running child process and clears session state; called when the panel closes.

Only one session exists at a time (state is `Mutex<Option<PtySession>>`, not keyed/multi-session) — matches the "one panel, one purpose" scope decided in brainstorming.

**Frontend:**

- `@tauri-apps/api` (new dependency — first real use of Tauri's JS↔Rust IPC in this repo beyond config) for `invoke()` and `listen()`.
- `@xterm/xterm` + `@xterm/addon-fit` (new dependency) render the PTY output and size the terminal to its container.
- `components/knowledge-terminal.tsx` — replaces `add-knowledge-button.tsx`. Owns:
  - The header trigger button (toggles panel open/closed).
  - The sliding panel itself (`fixed inset-y-0 left-0`, so it visually anchors to the window edge regardless of DOM nesting under the header), animated via a CSS transform transition (`translate-x-0` / `-translate-x-full`, ~200ms ease-out).
  - Panel header: CLI picker (Claude Code / Codex CLI / Gemini CLI, defaults to last choice via the same `localStorage` key pattern as before), close button.
  - Body: the `xterm.js` terminal instance, filling the remaining panel height.
  - Bottom composer bar: file attachment tray (multiple files, each with a name and a delete `×`, plus a count), a text input, and Send.

**Command resolution (Node, unchanged pattern from before):** `POST /api/knowledge/resolve-command` — given a provider id, checks `isCliAvailable(provider.binary)` (existing `lib/cli-providers.ts`) and returns either `{ program: provider.binary, args: [initialPrompt] }` (if installed) or `{ program: "npm", args: ["install", "-g", ...] }` (the provider's install command, split into argv — no shell needed, `npm` is a real binary). The panel calls this once when it opens (or when the CLI picker changes), then calls `invoke("spawn_pty", { program, args, cwd })`.

**File staging (Node, reused):** `POST /api/knowledge/stage-files` — thin route wrapping the existing `writeToInbox()` from `lib/rag-inbox.ts`. Takes uploaded files, stages them into `.rag-inbox/`, returns the saved filenames.

## Composer behavior (attach → send, like a chat box)

- Attaching a file just adds it to the tray — nothing is staged or sent yet, exactly like attaching a file to a chat message.
- Pressing **Send**:
  1. If files are attached, POST them to `/api/knowledge/stage-files`, get back the saved filenames.
  2. Build one message: `"New files added: <names> in .rag-inbox/. <typed text>"` if files were attached, or just `<typed text>` if not. (Requires at least one of: typed text, attached files.)
  3. `invoke("write_pty", { data: message + "\r" })` — types the message into the live session and presses Enter, exactly as if the user had typed it themselves.
  4. Clears the composer (text + attachment tray).
- The terminal body itself remains directly typable/interactive throughout — the composer is a convenience for attaching files with a message, not the only way to interact with the session.

## Session lifecycle

- **Open:** resolve the command for the selected provider, spawn the PTY, start rendering.
- **Provider changed while open:** kill the current session, resolve + spawn a new one for the newly selected provider (switching CLI mid-session doesn't make sense for a live PTY).
- **Close:** kills the PTY process (`kill_pty`) and hides the panel. Reopening always starts a fresh session — no session persistence across a close, kept simple deliberately (YAGNI; add resume-in-background later only if it's actually missed).

## Testing approach

- `lib/cli-providers.ts` and `lib/rag-inbox.ts` keep their existing Vitest coverage (unchanged).
- The command-resolution logic (`/api/knowledge/resolve-command`) is a plain function of provider + availability — testable in Vitest like the old route was.
- The Rust PTY commands and the `xterm.js`/IPC wiring are **not** meaningfully testable through the existing Chrome-based browser preview tool, because `window.__TAURI__` (and therefore `invoke`/`listen`) only exists inside the real Tauri webview, not a plain browser tab hitting `localhost:3000`. Verification for this part is: `cargo check` for Rust compile correctness, and manual verification by running `npx tauri dev` and exercising the panel in the actual native window.

## Out of scope (explicitly, per YAGNI)

- No general-purpose shell mode — the panel only ever runs the chosen CLI (or its install command). Confirmed in brainstorming.
- No session persistence across panel close.
- No multi-session/tabs — one PTY at a time.
- No Windows/Linux-specific PTY handling beyond what `portable-pty` already provides cross-platform (it's designed to be cross-platform, unlike the old `osascript` approach which was macOS-only — this is a side benefit of the rewrite, not a requirement being added).
