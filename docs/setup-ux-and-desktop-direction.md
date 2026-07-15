# Setup UX & Desktop Packaging

## Terminal-based setup stays

`npm run setup` (masked input, writes straight to `.env`, never echoed/logged) remains the
only way secrets enter this project. See [Security Considerations](security.md) for why —
short version: typing a secret into an AI assistant's chat puts it in a cloud-hosted
transcript, which is the wrong place for it regardless of how local the setup feels. This
doc does not change that boundary; it adds a convenience trigger for it.

## The in-app "Open setup terminal" trigger

The two database-error screens (`app/database-setup-required.tsx`,
`app/database-connection-failed.tsx`) include a "Run setup" block with two actions:

- **Open setup terminal** — calls `POST /api/setup/open-terminal`
  (`app/api/setup/open-terminal/route.ts`), which opens a real `Terminal.app` window
  (via `osascript`, macOS only, non-production only — see `lib/setup-terminal.ts`) running
  `npm run setup` in the repo root. The route never touches `.env`, never reads a secret,
  and never runs outside a local dev machine — same security posture as the existing
  `/api/ollama/start` local-helper route, gated by the same `getLocalRequestFailure` guard.
- **Check again** — reloads the page, so the user doesn't have to remember to do it after
  finishing setup in the opened terminal.

This is additive UX only. It does not reimplement or bypass `scripts/setup-env.ts`'s masked
prompting; it launches the exact same script a human would run manually.

Windows/Linux: the terminal-open button isn't available yet (macOS-only, matching the
existing scope already used elsewhere in this project's docs for the equivalent
AI-assistant-driven flow — see `docs/security.md`). Those platforms still get the
"Check again" button and the existing static setup instructions.

**Escaping note for future editors of `lib/setup-terminal.ts`:** the path passed to
`osascript` goes through two separate quoting layers — POSIX shell quoting (for the `cd`
argument) and AppleScript string-literal quoting (for the outer `do script "..."`
argument) — and they are not interchangeable. An earlier version used `JSON.stringify()`
to quote the path, which produces JSON double-quote syntax; that syntax breaks the outer
AppleScript string literal instead of escaping into it, and `osascript` failed with a
syntax error on every real path. `lib/setup-terminal.test.ts` guards against a regression
using `osacompile` (validates AppleScript syntax without executing/opening a terminal).

## Desktop packaging: Tauri, not Electron

This project now has a working **dev-mode** Tauri wrapper at `src-tauri/`. Run
`npx tauri dev` and it opens a native window, automatically starts `npm run dev` for you
(`build.beforeDevCommand` in `src-tauri/tauri.conf.json`), and points the window at
`http://localhost:3000` once it's ready. This directly solves the original friction this
feature was requested for: an MCP client (or a non-technical user) no longer has to
separately remember to start a Node process before using the app.

Why Tauri over Electron: smaller installer (~10-20MB vs Electron's ~150-200MB bundled
Chromium+Node), and this project's actual runtime need — "run this Next.js server as a
background process, show it in a native window" — is exactly what Tauri's sidecar-process
support is for, without needing the whole app rewritten in Rust.

**What's built:**
- `src-tauri/` — standard `tauri init` scaffold (`Cargo.toml`, `tauri.conf.json`,
  `src/main.rs`, `src/lib.rs`), `identifier: "dev.awesomeragforge.app"`.
- `build.devUrl: "http://localhost:3000"`, `build.beforeDevCommand: "npm run dev"` — dev
  mode is fully functional: `npx tauri dev` is a single command that replaces "start
  `npm run dev` in one terminal, then separately open a browser."
- `src-tauri/dist/index.html` — a placeholder only. Tauri's config schema requires
  `frontendDist` to point at a real directory even though dev mode never loads it (dev mode
  loads `devUrl` instead).

**What's explicitly NOT built yet (production bundling):**
- `npx tauri build` is not wired up to produce a real installable app. This app has API
  routes and server-side rendering — it is not statically exportable — so a production
  build requires bundling a real Node.js binary as a Tauri **sidecar process** that runs
  `next start` (and, separately, the MCP server), with the native window pointing at that
  sidecar's `localhost` port instead of `devUrl`. That sidecar-spawn/lifecycle wiring
  (Rust) has not been written.
- No OS-keychain-backed credential storage. If this is added later, the pattern is: a
  Tauri command wrapping a keychain plugin (e.g. `tauri-plugin-keyring`) for
  save/read, plus passing the read-back secret as an env var when spawning the Node
  sidecar — this is the "genuinely unbypassable" secret storage `docs/security.md` already
  flags as a documented future option, not yet built. The terminal-based `npm run setup`
  flow remains the only way secrets enter `.env` today, in or out of the Tauri wrapper.
- No app icons customized (uses Tauri's scaffolded defaults), no code signing, no
  auto-updater, no menu/tray.
- Ordinary feature work (new pages, routes, Prisma models, MCP tools) does not require
  touching `src-tauri/` at all, today or after the sidecar work above — only new *native*
  capabilities (menus, tray, keychain-backed secrets, a second sidecar) would.

## In-app terminal panel (Add Knowledge)

The header's "Terminal" button opens a real, interactive terminal inside the Tauri
window itself -- not an external `Terminal.app` window. This replaced the earlier
`osascript`-based launcher entirely (see git history for `lib/setup-terminal.ts` and
`lib/provider-terminal.ts` if you need the old approach for reference).

**How it works:** `src-tauri/src/pty.rs` uses `portable-pty` to open a real PTY and
spawn the chosen CLI (Claude Code, Codex CLI, or Gemini CLI) directly -- as a program +
argv array, no shell string, so there's no AppleScript/shell-quoting class of bug to
maintain. `components/knowledge-terminal.tsx` renders the session with `@xterm/xterm`,
forwarding keystrokes to `write_pty` and rendering the `pty-output` event stream.

**Composer bar:** attaching a file only adds it to a tray (like a chat attachment) --
nothing is staged until you press Send, which stages files into `.rag-inbox/`
(`POST /api/knowledge/stage-files`) and types a combined message into the live session.

**Tauri-only:** this only works inside the real Tauri webview (`npx tauri dev`) --
`invoke`/`listen` require `window.__TAURI__`, which a plain browser tab hitting
`localhost:3000` doesn't have. The panel UI still renders in a browser tab; the PTY
session itself will show `sessionError` there.

**One session at a time:** switching the CLI picker while the panel is open kills the
current session and starts a fresh one for the newly selected provider. Closing the
panel kills the session; reopening always starts clean -- no session persistence across
a close (YAGNI; revisit only if that's actually missed).

## Production/Vercel is unaffected

None of the above changes what ships to production. This project's Vercel deployment
already only builds and serves `public-site/` (a static docs microsite) — see
[Deployment](deployment.md#the-only-thing-meant-to-be-deployed-publicly-public-site). The
new route, component, and `src-tauri/` all live outside that deploy path, and nothing here
changes it.
