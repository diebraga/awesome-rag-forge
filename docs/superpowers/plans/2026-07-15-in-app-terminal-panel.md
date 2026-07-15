# In-App Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the external-Terminal.app "Add Knowledge" flow with a real interactive terminal embedded in the Tauri window: a left-sliding panel running Claude Code/Codex/Gemini CLI over a native PTY, with a chat-style composer at the bottom for attaching files and sending messages into the live session.

**Architecture:** `portable-pty` (Rust) spawns and owns the PTY session behind four Tauri commands; `@xterm/xterm` (frontend) renders its output and forwards keystrokes over `@tauri-apps/api`'s `invoke`/`listen`. Command resolution (which binary/args to run) and file staging stay in small Node routes, reusing the existing `lib/cli-providers.ts` and `lib/rag-inbox.ts`.

**Tech Stack:** `portable-pty = "0.9"` (Rust), `@tauri-apps/api@^2.11`, `@xterm/xterm@^6`, `@xterm/addon-fit@^0.11`.

## Global Constraints

- This feature only works inside the real Tauri window — `invoke`/`listen` require `window.__TAURI__`, absent in a plain browser tab. UI shell (button, panel slide, composer) must still render sensibly in a browser tab (no crash), but the actual PTY session will only work when run via `npx tauri dev`.
- One PTY session at a time — no multi-session/tabs (YAGNI, per spec).
- Deletes `lib/provider-terminal.ts` (+ test), `app/api/knowledge/add/route.ts`, `components/add-knowledge-button.tsx` — the external-terminal path is fully replaced, not kept alongside.
- Reuses `lib/cli-providers.ts` and `lib/rag-inbox.ts` unchanged.
- Branch: continue on `feature/add-knowledge-launcher` (already pushed once). Do not push again until told to.

---

### Task 1: Rust PTY commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/pty.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces (Tauri commands, invoked from JS as `invoke("spawn_pty", {...})` etc.): `spawn_pty(program: String, args: Vec<String>, cwd: String) -> Result<(), String>`, `write_pty(data: String) -> Result<(), String>`, `resize_pty(rows: u16, cols: u16) -> Result<(), String>`, `kill_pty() -> Result<(), String>`.
- Emits events: `pty-output` (payload: `String`, one chunk of terminal output), `pty-exit` (payload: `null`).

- [ ] **Step 1: Add the `portable-pty` dependency**

```bash
cd src-tauri
cargo add portable-pty@0.9
```

- [ ] **Step 2: Write `src-tauri/src/pty.rs`**

```rust
use std::io::{Read, Write};
use std::sync::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(pub Mutex<Option<PtySession>>);

#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    state: State<PtyState>,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    // A new session replaces any existing one -- only one PTY at a time.
    if let Some(mut existing) = state.0.lock().map_err(|e| e.to_string())?.take() {
        let _ = existing.child.kill();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 32, cols: 100, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&program);
    cmd.args(&args);
    cmd.cwd(&cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    if app_handle.emit("pty-output", chunk).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pty-exit", ());
    });

    *state.0.lock().map_err(|e| e.to_string())? = Some(PtySession { writer, master: pair.master, child });
    Ok(())
}

#[tauri::command]
pub fn write_pty(state: State<PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("No active terminal session.")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, rows: u16, cols: u16) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_ref().ok_or("No active terminal session.")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_pty(state: State<PtyState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = guard.take() {
        let _ = session.child.kill();
    }
    Ok(())
}
```

- [ ] **Step 3: Wire the module into `src-tauri/src/lib.rs`**

Replace the file with:
```rust
mod pty;

use pty::{kill_pty, resize_pty, spawn_pty, write_pty, PtyState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(PtyState::default())
    .invoke_handler(tauri::generate_handler![spawn_pty, write_pty, resize_pty, kill_pty])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

- [ ] **Step 4: Compile check**

Run: `cd src-tauri && source ~/.cargo/env && cargo check`
Expected: compiles with no errors (warnings about unused `resize_pty`/etc. before the frontend calls them are fine at this stage)

- [ ] **Step 5: Commit**

```bash
cd /Users/diegobraga/Documents/awesome-rag-forge
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/pty.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add PTY-backed terminal commands (spawn/write/resize/kill)"
```

---

### Task 2: Command resolution + file staging routes

**Files:**
- Create: `app/api/knowledge/resolve-command/route.ts`
- Create: `app/api/knowledge/resolve-command/route.test.ts`
- Create: `app/api/knowledge/stage-files/route.ts`
- Delete: `app/api/knowledge/add/route.ts`

**Interfaces:**
- Consumes: `getCliProvider`, `isCliAvailable` from `lib/cli-providers.ts`; `writeToInbox`, `RAG_INBOX_DIRNAME` from `lib/rag-inbox.ts`; `getLocalRequestFailure` from `lib/local-request-guard.ts`.
- Produces: `POST /api/knowledge/resolve-command` — body `{ providerId: string, prompt?: string }`, returns `{ ok: true; program: string; args: string[]; cwd: string } | { ok: false; error: string }`. `cwd` is `process.cwd()` from the Node process (the repo root during `npm run dev`) — the frontend has no other way to learn this absolute path, and passing `"."` to `spawn_pty` would resolve relative to the Tauri Rust process's own working directory (`src-tauri/`, not the repo root), spawning the CLI in the wrong place. `POST /api/knowledge/stage-files` — multipart `files[]`, returns `{ ok: true; files: string[] } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

`app/api/knowledge/resolve-command/route.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/cli-providers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cli-providers")>("@/lib/cli-providers");
  return { ...actual, isCliAvailable: vi.fn() };
});

import { isCliAvailable } from "@/lib/cli-providers";
import { POST } from "./route";

function requestWith(body: unknown) {
  return new Request("http://localhost:3000/api/knowledge/resolve-command", {
    method: "POST",
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/knowledge/resolve-command", () => {
  test("returns the CLI binary + prompt when installed", async () => {
    vi.mocked(isCliAvailable).mockResolvedValue(true);
    const response = await POST(requestWith({ providerId: "claude", prompt: "hello" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, program: "claude", args: ["hello"], cwd: process.cwd() });
  });

  test("returns the install command when the CLI is missing", async () => {
    vi.mocked(isCliAvailable).mockResolvedValue(false);
    const response = await POST(requestWith({ providerId: "codex", prompt: "hello" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, program: "npm", args: ["install", "-g", "@openai/codex"], cwd: process.cwd() });
  });

  test("rejects an unknown provider", async () => {
    const response = await POST(requestWith({ providerId: "nope" }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/knowledge/resolve-command/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write `app/api/knowledge/resolve-command/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { getCliProvider, isCliAvailable } from "@/lib/cli-providers";

/**
 * @swagger
 * /api/knowledge/resolve-command:
 *   post:
 *     summary: Resolve which program/args the in-app terminal panel should spawn for a provider
 *     description: Local-only. Returns the CLI binary + prompt if installed, or the provider's install command (as argv, no shell) if not -- the frontend passes this straight to the Tauri spawn_pty command.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Resolved program + args
 *       400:
 *         description: Unknown provider
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  const body = await request.json();
  const provider = getCliProvider(String(body.providerId ?? ""));
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined;
  const available = await isCliAvailable(provider.binary);

  if (available) {
    return NextResponse.json({ ok: true, program: provider.binary, args: prompt ? [prompt] : [], cwd: process.cwd() });
  }

  const [installProgram, ...installArgs] = provider.installCommand.split(" ");
  return NextResponse.json({ ok: true, program: installProgram, args: installArgs, cwd: process.cwd() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/knowledge/resolve-command/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `app/api/knowledge/stage-files/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { writeToInbox } from "@/lib/rag-inbox";

/**
 * @swagger
 * /api/knowledge/stage-files:
 *   post:
 *     summary: Stage files attached in the terminal panel's composer into .rag-inbox/
 *     description: Local-only. Writes uploaded files flat into .rag-inbox/ and returns their saved names, so the frontend can build the "New files added" message sent into the live PTY session.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Files staged
 *       400:
 *         description: No files provided
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  const formData = await request.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 });
  }

  const staged = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: Buffer.from(await file.arrayBuffer()) })),
  );
  writeToInbox(staged);

  return NextResponse.json({ ok: true, files: staged.map((file) => file.name.replace(/[\\/]/g, "_")) });
}
```

- [ ] **Step 6: Delete the old combined route**

```bash
git rm app/api/knowledge/add/route.ts
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add app/api/knowledge/resolve-command app/api/knowledge/stage-files
git commit -m "feat: split knowledge-add route into resolve-command + stage-files"
```

---

### Task 3: Delete the external-terminal path

**Files:**
- Delete: `lib/provider-terminal.ts`
- Delete: `lib/provider-terminal.test.ts`

**Interfaces:** none — nothing else imports these after Task 2.

- [ ] **Step 1: Confirm nothing else imports it**

Run: `grep -rl "provider-terminal" --include="*.ts" --include="*.tsx" app components lib`
Expected: no output (already removed the only importer, the old route, in Task 2)

- [ ] **Step 2: Delete and commit**

```bash
git rm lib/provider-terminal.ts lib/provider-terminal.test.ts
git commit -m "chore: remove external-terminal (osascript) path, superseded by in-app PTY panel"
```

---

### Task 4: Frontend dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the JS dependencies**

```bash
npm install @tauri-apps/api@^2.11 @xterm/xterm@^6 @xterm/addon-fit@^0.11
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add package.json package-lock.json
git commit -m "chore: add @tauri-apps/api and xterm.js dependencies"
```

---

### Task 5: The terminal panel component

**Files:**
- Create: `components/knowledge-terminal.tsx`
- Delete: `components/add-knowledge-button.tsx`
- Modify: `components/header.tsx`

**Interfaces:**
- Consumes: `invoke`, `listen` from `@tauri-apps/api/core` and `@tauri-apps/api/event`; `Terminal` from `@xterm/xterm`; `FitAddon` from `@xterm/addon-fit`; `POST /api/knowledge/resolve-command` and `POST /api/knowledge/stage-files` (Task 2).
- Produces: `<KnowledgeTerminal />`, mounted in `Header` in place of the old `<AddKnowledgeButton />`.

- [ ] **Step 1: Write the component**

`components/knowledge-terminal.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDERS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" },
] as const;

const LAST_PROVIDER_KEY = "add-knowledge-last-provider";
const INITIAL_PROMPT = "Let's add some knowledge to the knowledge base.";

export function KnowledgeTerminal() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>(
    () => (typeof window !== "undefined" && window.localStorage.getItem(LAST_PROVIDER_KEY)) || "claude",
  );
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function startSession() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled || !containerRef.current) return;

      const term = new Terminal({ convertEol: true, fontSize: 13 });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      term.onData((data) => {
        invoke("write_pty", { data }).catch(() => {});
      });
      terminalRef.current = term;

      const unlistenOutput = await listen<string>("pty-output", (event) => {
        term.write(event.payload);
      });
      unlistenRefs.current.push(unlistenOutput);

      setSessionError(null);
      try {
        window.localStorage.setItem(LAST_PROVIDER_KEY, provider);
        const response = await fetch("/api/knowledge/resolve-command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: provider, prompt: INITIAL_PROMPT }),
        });
        const result = await response.json();
        if (!result.ok) {
          setSessionError(result.error);
          return;
        }
        await invoke("spawn_pty", { program: result.program, args: result.args, cwd: result.cwd });
      } catch {
        setSessionError("Unable to start a terminal session. This panel only works inside the desktop app.");
      }
    }

    startSession();

    return () => {
      cancelled = true;
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];
      terminalRef.current?.dispose();
      terminalRef.current = null;
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("kill_pty").catch(() => {}));
    };
    // Re-runs on provider change (kills + respawns) and on close (cleanup only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  function toggleFile(file: File) {
    setAttachedFiles((prev) => [...prev, file]);
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!message.trim() && attachedFiles.length === 0) return;
    setSending(true);

    let filePrefix = "";
    if (attachedFiles.length > 0) {
      const formData = new FormData();
      for (const file of attachedFiles) formData.append("files", file);
      const response = await fetch("/api/knowledge/stage-files", { method: "POST", body: formData });
      const result = await response.json();
      if (result.ok) {
        filePrefix = `New files added: ${result.files.join(", ")} in .rag-inbox/. `;
      }
    }

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_pty", { data: `${filePrefix}${message.trim()}\r` }).catch(() => {});

    setMessage("");
    setAttachedFiles([]);
    setSending(false);
  }

  return (
    <>
      <Button onClick={() => setOpen((value) => !value)} variant="outline" size="sm" type="button">
        <PlusCircle className="size-4" />
        Terminal
      </Button>
      <div
        className={`fixed inset-y-0 left-0 z-40 flex w-[420px] flex-col border-r border-black/10 bg-white shadow-lg transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="rounded-md border border-black/10 px-2 py-1 text-sm"
          >
            {PROVIDERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" type="button" onClick={() => setOpen(false)} aria-label="Close terminal">
            <X className="size-4" />
          </Button>
        </div>

        {sessionError && <p className="px-4 py-2 text-sm text-red-600">{sessionError}</p>}

        <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden bg-black" />

        <div className="space-y-2 border-t border-black/10 p-3">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachedFiles.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-xs text-black"
                >
                  {file.name}
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <span className="px-1 py-1 text-xs text-black/40">{attachedFiles.length} file(s)</span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                Array.from(event.target.files ?? []).forEach(toggleFile);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              Attach
            </Button>
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Message the session…"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSend();
              }}
            />
            <Button type="button" size="sm" disabled={sending} onClick={handleSend}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire into the header**

In `components/header.tsx`, replace:
```ts
import { AddKnowledgeButton } from "@/components/add-knowledge-button";
```
with:
```ts
import { KnowledgeTerminal } from "@/components/knowledge-terminal";
```

Replace:
```tsx
<AddKnowledgeButton />
```
with:
```tsx
<KnowledgeTerminal />
```

- [ ] **Step 3: Delete the old component**

```bash
git rm components/add-knowledge-button.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (if `@xterm/xterm`'s types need `"moduleResolution": "bundler"` or similar, check `tsconfig.json` already supports dynamic `import()` type references — it does, since the codebase already uses dynamic `import()` elsewhere)

- [ ] **Step 5: Commit**

```bash
git add components/knowledge-terminal.tsx components/header.tsx
git commit -m "feat: add in-app PTY terminal panel, replacing external Terminal.app launcher"
```

---

### Task 6: Update desktop-packaging docs

**Files:**
- Modify: `docs/setup-ux-and-desktop-direction.md`

- [ ] **Step 1: Add a new section describing the terminal panel**

Add after the "Desktop packaging: Tauri, not Electron" section:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup-ux-and-desktop-direction.md
git commit -m "docs: document the in-app PTY terminal panel"
```

---

### Task 7: Full verification (no push)

**Files:** none

- [ ] **Step 1: Rust compile check**

Run: `cd src-tauri && source ~/.cargo/env && cargo check`
Expected: no errors

- [ ] **Step 2: Run the full JS test suite**

Run: `npm test`
Expected: all tests pass, including the new `resolve-command` route test; the deleted `provider-terminal.test.ts` no longer runs

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint . && npm run build`
Expected: all succeed (pre-existing unrelated lint issues in `lib/prisma.test.ts` and generated Rust build output are not regressions)

- [ ] **Step 4: Confirm branch state**

```bash
git status
git log --oneline origin/feature/add-knowledge-launcher..HEAD
```
Expected: working tree clean, new commits present, none pushed yet.

- [ ] **Step 5: Manual verification in the real Tauri app**

Run: `npx tauri dev`. In the native window: click **Terminal** in the header -- the panel
should slide in smoothly from the left. Confirm the CLI picker shows all three
providers, the terminal body shows real output (either the CLI starting up or an
install-command run if it's not on `PATH`), typing directly into the terminal works,
attaching a file shows it in the tray with a working remove `×`, and Send both stages
the file and types the combined message into the session. Click the close button and
confirm the panel slides out and the process is killed (no orphaned process -- check
`ps aux | grep <binary>` after closing).

No commit for this task -- verification only.
