# Add Knowledge Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add Knowledge" button in the header that stages picked files into `.rag-inbox/` and opens a macOS terminal running the user's chosen CLI (Claude Code, Codex, or Gemini CLI), primed to add those files to the RAG via MCP — or, if that CLI isn't installed, opens a terminal with its install command instead.

**Architecture:** Three small `lib/` modules (provider table + availability check, terminal-opening with AppleScript escaping ported from the deleted `lib/setup-terminal.ts`, inbox file staging) wired together by one local-only API route, driven by one client component mounted in the header.

**Tech Stack:** Next.js route handlers, `node:child_process` (`spawn`/`execFile`), AppleScript via `osascript` (macOS only), plain `<input type="file">` — no new dependencies.

## Global Constraints

- macOS only, never in production — same posture as the deleted `lib/setup-terminal.ts` and `lib/ollama.ts`.
- No new npm dependencies (no Tauri dialog plugin — file *contents* are enough, no filesystem path needed).
- No in-app LLM/chat integration — this only shells out to already-installed CLIs.
- Reuse `getLocalRequestFailure()` from `lib/local-request-guard.ts` on the new route.
- Branch only, per user instruction — do not push or open a PR as part of this plan.

---

### Task 0: Create the working branch

**Files:** none

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout -b feature/add-knowledge-launcher
```

- [ ] **Step 2: Verify**

```bash
git branch --show-current
```
Expected: `feature/add-knowledge-launcher`

---

### Task 1: CLI provider table + availability check

**Files:**
- Create: `lib/cli-providers.ts`
- Test: `lib/cli-providers.test.ts`

**Interfaces:**
- Produces: `CLI_PROVIDERS: CliProvider[]`, `getCliProvider(id: string): CliProvider | undefined`, `isCliAvailable(binary: string): Promise<boolean>`, type `CliProvider = { id: string; label: string; binary: string; installCommand: string }`.

- [ ] **Step 1: Write the failing test**

`lib/cli-providers.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { CLI_PROVIDERS, getCliProvider, isCliAvailable } from "./cli-providers";

describe("CLI_PROVIDERS", () => {
  test("has exactly claude, codex, gemini", () => {
    expect(CLI_PROVIDERS.map((p) => p.id).sort()).toEqual(["claude", "codex", "gemini"]);
  });
});

describe("getCliProvider", () => {
  test("finds a known provider", () => {
    expect(getCliProvider("claude")?.binary).toBe("claude");
  });

  test("returns undefined for an unknown id", () => {
    expect(getCliProvider("nonexistent")).toBeUndefined();
  });
});

describe("isCliAvailable", () => {
  test("true for a binary guaranteed to exist", async () => {
    expect(await isCliAvailable("ls")).toBe(true);
  });

  test("false for a binary that does not exist", async () => {
    expect(await isCliAvailable("definitely-not-a-real-binary-xyz")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/cli-providers.test.ts`
Expected: FAIL — `Cannot find module './cli-providers'`

- [ ] **Step 3: Write the implementation**

`lib/cli-providers.ts`:
```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CliProviderId = "claude" | "codex" | "gemini";

export type CliProvider = {
  id: CliProviderId;
  label: string;
  binary: string;
  installCommand: string;
};

/** The AI CLIs that can add knowledge via this repo's MCP server (docs/mcp-server.md). Cursor/Windsurf/Cline are editor integrations, not terminal-launchable, so they're excluded. */
export const CLI_PROVIDERS: CliProvider[] = [
  { id: "claude", label: "Claude Code", binary: "claude", installCommand: "npm install -g @anthropic-ai/claude-code" },
  { id: "codex", label: "Codex CLI", binary: "codex", installCommand: "npm install -g @openai/codex" },
  { id: "gemini", label: "Gemini CLI", binary: "gemini", installCommand: "npm install -g @google/gemini-cli" },
];

export function getCliProvider(id: string): CliProvider | undefined {
  return CLI_PROVIDERS.find((provider) => provider.id === id);
}

export async function isCliAvailable(binary: string): Promise<boolean> {
  try {
    await execFileAsync("which", [binary]);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/cli-providers.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/cli-providers.ts lib/cli-providers.test.ts
git commit -m "feat: add CLI provider table and availability check"
```

---

### Task 2: Terminal-opening helper (ported escaping logic)

**Files:**
- Create: `lib/provider-terminal.ts`
- Test: `lib/provider-terminal.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `canOpenProviderTerminal(opts?): boolean`, `shellQuoteSingleArg(value: string): string`, `buildOpenTerminalScript(repoRoot: string, shellCommandSuffix: string): string`, `openTerminalWithCommand(shellCommandSuffix: string, repoRoot?: string): Promise<void>`, `PROVIDER_TERMINAL_UNAVAILABLE_ERROR: string`.

- [ ] **Step 1: Write the failing test**

`lib/provider-terminal.test.ts`:
```ts
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { buildOpenTerminalScript, canOpenProviderTerminal, shellQuoteSingleArg } from "./provider-terminal";

describe("canOpenProviderTerminal", () => {
  test("true on macOS outside production", () => {
    expect(canOpenProviderTerminal({ platform: "darwin", isProduction: false })).toBe(true);
  });

  test("false in production", () => {
    expect(canOpenProviderTerminal({ platform: "darwin", isProduction: true })).toBe(false);
  });

  test("false on non-macOS platforms", () => {
    expect(canOpenProviderTerminal({ platform: "linux", isProduction: false })).toBe(false);
    expect(canOpenProviderTerminal({ platform: "win32", isProduction: false })).toBe(false);
  });
});

// Regression coverage for the JSON.stringify-in-AppleScript bug fixed in the
// deleted lib/setup-terminal.ts (git history, commit 57b1e27): osacompile
// validates AppleScript syntax without executing the script.
describe.skipIf(process.platform !== "darwin")("buildOpenTerminalScript", () => {
  function assertValidAppleScript(script: string) {
    execFileSync("osacompile", ["-o", "/dev/null", "-"], { input: script });
  }

  test("produces valid AppleScript for a plain command", () => {
    expect(() =>
      assertValidAppleScript(buildOpenTerminalScript("/Users/dev/awesome-rag-forge", "npm run setup")),
    ).not.toThrow();
  });

  test("produces valid AppleScript for a command containing quoted text", () => {
    expect(() =>
      assertValidAppleScript(
        buildOpenTerminalScript("/Users/dev/repo", `claude ${shellQuoteSingleArg("Add these files")}`),
      ),
    ).not.toThrow();
  });

  test("produces valid AppleScript for a path with a space and single quote", () => {
    expect(() =>
      assertValidAppleScript(buildOpenTerminalScript("/Users/dev's-machine/awesome rag forge", "npm run setup")),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/provider-terminal.test.ts`
Expected: FAIL — `Cannot find module './provider-terminal'`

- [ ] **Step 3: Write the implementation**

`lib/provider-terminal.ts`:
```ts
import { spawn } from "node:child_process";

export const PROVIDER_TERMINAL_UNAVAILABLE_ERROR =
  "Opening a terminal automatically is only supported on macOS outside production.";

/**
 * Whether this server process may open a terminal on the host machine.
 * Same posture as the deleted lib/setup-terminal.ts's canOpenSetupTerminal():
 * macOS only, never in production, since app/api never ships to a deployed
 * instance anyway (see docs/deployment.md).
 */
export function canOpenProviderTerminal({
  platform = process.platform,
  isProduction = process.env.NODE_ENV === "production",
}: { platform?: NodeJS.Platform; isProduction?: boolean } = {}) {
  return !isProduction && platform === "darwin";
}

/**
 * Quotes a value for safe use inside a single POSIX shell argument. See the
 * deleted lib/setup-terminal.ts (git history, commit 57b1e27) for why
 * JSON.stringify is not a substitute: it produces double-quote JSON syntax,
 * which breaks the outer AppleScript string literal instead of escaping
 * into it.
 */
export function shellQuoteSingleArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptQuoteString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Exported (only) for unit testing the shell/AppleScript escaping in isolation. */
export function buildOpenTerminalScript(repoRoot: string, shellCommandSuffix: string): string {
  const shellCommand = `cd ${shellQuoteSingleArg(repoRoot)} && ${shellCommandSuffix}`;
  return `tell application "Terminal" to do script "${appleScriptQuoteString(shellCommand)}"`;
}

/** Opens Terminal.app, cd's into repoRoot, and runs shellCommandSuffix. Rejects with a plain, safe-to-display Error if osascript itself fails. */
export function openTerminalWithCommand(shellCommandSuffix: string, repoRoot: string = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = buildOpenTerminalScript(repoRoot, shellCommandSuffix);
    const child = spawn("osascript", ["-e", script]);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Unable to open a terminal window."));
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/provider-terminal.test.ts`
Expected: PASS (6 tests, or 3 non-skipped + 3 skipped off macOS)

- [ ] **Step 5: Commit**

```bash
git add lib/provider-terminal.ts lib/provider-terminal.test.ts
git commit -m "feat: add terminal-opening helper for AI CLI launches"
```

---

### Task 3: Inbox file staging

**Files:**
- Create: `lib/rag-inbox.ts`
- Test: `lib/rag-inbox.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `RAG_INBOX_DIRNAME: string`, `writeToInbox(files: { name: string; content: Buffer }[], repoRoot?: string): string` (returns the absolute inbox dir path).

- [ ] **Step 1: Write the failing test**

`lib/rag-inbox.test.ts`:
```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RAG_INBOX_DIRNAME, writeToInbox } from "./rag-inbox";

describe("writeToInbox", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("writes file contents under a .rag-inbox directory", () => {
    dir = mkdtempSync(join(tmpdir(), "rag-inbox-test-"));
    writeToInbox([{ name: "notes.txt", content: Buffer.from("hello") }], dir);
    const written = readFileSync(join(dir, RAG_INBOX_DIRNAME, "notes.txt"), "utf-8");
    expect(written).toBe("hello");
  });

  test("strips directory components from filenames", () => {
    dir = mkdtempSync(join(tmpdir(), "rag-inbox-test-"));
    writeToInbox([{ name: "../../etc/passwd", content: Buffer.from("x") }], dir);
    expect(existsSync(join(dir, RAG_INBOX_DIRNAME, ".._.._etc_passwd"))).toBe(true);
    expect(existsSync(join(dir, "..", "..", "etc", "passwd"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/rag-inbox.test.ts`
Expected: FAIL — `Cannot find module './rag-inbox'`

- [ ] **Step 3: Write the implementation**

`lib/rag-inbox.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RAG_INBOX_DIRNAME = ".rag-inbox";

/**
 * Stages uploaded file contents flat under <repoRoot>/.rag-inbox/, so a
 * launched CLI can be told "add the files in .rag-inbox/" without the app
 * ever needing real filesystem paths from the browser's file picker.
 * Filenames are sanitized (slashes stripped) since they're client-supplied
 * over an HTTP request -- a trust boundary.
 */
export function writeToInbox(files: { name: string; content: Buffer }[], repoRoot: string = process.cwd()): string {
  const inboxDir = join(repoRoot, RAG_INBOX_DIRNAME);
  mkdirSync(inboxDir, { recursive: true });
  for (const file of files) {
    const safeName = file.name.replace(/[\\/]/g, "_");
    writeFileSync(join(inboxDir, safeName), file.content);
  }
  return inboxDir;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/rag-inbox.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add `.rag-inbox/` to `.gitignore`**

Append to `.gitignore`:
```
# Staging folder for files handed to a launched AI CLI (Add Knowledge button)
.rag-inbox/
```

- [ ] **Step 6: Commit**

```bash
git add lib/rag-inbox.ts lib/rag-inbox.test.ts .gitignore
git commit -m "feat: add inbox file staging for launched CLI sessions"
```

---

### Task 4: API route wiring the three modules together

**Files:**
- Create: `app/api/knowledge/add/route.ts`

**Interfaces:**
- Consumes: `getLocalRequestFailure` from `lib/local-request-guard.ts`; `getCliProvider`, `isCliAvailable` from `lib/cli-providers.ts`; `writeToInbox`, `RAG_INBOX_DIRNAME` from `lib/rag-inbox.ts`; `canOpenProviderTerminal`, `openTerminalWithCommand`, `shellQuoteSingleArg`, `PROVIDER_TERMINAL_UNAVAILABLE_ERROR` from `lib/provider-terminal.ts`.
- Produces: `POST /api/knowledge/add` — `FormData` in (`provider: string`, `files: File[]`), JSON out (`{ ok: true; installing: boolean } | { ok: false; error: string }`).

- [ ] **Step 1: Write the implementation**

`app/api/knowledge/add/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { getCliProvider, isCliAvailable } from "@/lib/cli-providers";
import { writeToInbox, RAG_INBOX_DIRNAME } from "@/lib/rag-inbox";
import {
  canOpenProviderTerminal,
  openTerminalWithCommand,
  shellQuoteSingleArg,
  PROVIDER_TERMINAL_UNAVAILABLE_ERROR,
} from "@/lib/provider-terminal";

/**
 * @swagger
 * /api/knowledge/add:
 *   post:
 *     summary: Stage picked files and open a terminal running the chosen AI CLI
 *     description: Local-only, non-production, macOS-only. Writes uploaded files to .rag-inbox/, then opens Terminal.app running the CLI (primed to add those files) or, if the CLI isn't installed, its install command.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Terminal opened
 *       400:
 *         description: Not available in this environment, unknown provider, or no files
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       500:
 *         description: Terminal failed to open
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  if (!canOpenProviderTerminal()) {
    return NextResponse.json({ ok: false, error: PROVIDER_TERMINAL_UNAVAILABLE_ERROR }, { status: 400 });
  }

  const formData = await request.formData();
  const provider = getCliProvider(String(formData.get("provider") ?? ""));
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Select at least one file." }, { status: 400 });
  }

  const staged = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: Buffer.from(await file.arrayBuffer()) })),
  );
  writeToInbox(staged);

  const available = await isCliAvailable(provider.binary);
  try {
    if (available) {
      const prompt = `Add the files in ${RAG_INBOX_DIRNAME}/ to the knowledge base.`;
      await openTerminalWithCommand(`${provider.binary} ${shellQuoteSingleArg(prompt)}`);
    } else {
      await openTerminalWithCommand(provider.installCommand);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to open a terminal window." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, installing: !available });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/knowledge/add/route.ts
git commit -m "feat: add /api/knowledge/add route"
```

---

### Task 5: Add Knowledge button (client component)

**Files:**
- Create: `components/add-knowledge-button.tsx`
- Modify: `components/header.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`; posts to `POST /api/knowledge/add` (Task 4).
- Produces: `<AddKnowledgeButton />`, mounted in `Header` next to the Disconnect button.

- [ ] **Step 1: Write the component**

`components/add-knowledge-button.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROVIDERS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" },
] as const;

const LAST_PROVIDER_KEY = "add-knowledge-last-provider";

export function AddKnowledgeButton() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>(
    () => (typeof window !== "undefined" && window.localStorage.getItem(LAST_PROVIDER_KEY)) || "claude",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setError("Select at least one file.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("provider", provider);
    for (const file of Array.from(files)) formData.append("files", file);

    const response = await fetch("/api/knowledge/add", { method: "POST", body: formData });
    const result = await response.json();
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.localStorage.setItem(LAST_PROVIDER_KEY, provider);
    setOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="relative">
      <Button onClick={() => setOpen((value) => !value)} variant="outline" size="sm" type="button">
        <PlusCircle className="size-4" />
        Add Knowledge
      </Button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-30 mt-2 w-72 space-y-3 rounded-lg border border-black/10 bg-white p-4 shadow-lg"
        >
          <div className="space-y-1.5">
            <label htmlFor="add-knowledge-provider" className="block text-sm text-black">
              CLI
            </label>
            <select
              id="add-knowledge-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm"
            >
              {PROVIDERS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="add-knowledge-files" className="block text-sm text-black">
              Files
            </label>
            <input id="add-knowledge-files" ref={fileInputRef} type="file" multiple className="w-full text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Opening…" : "Open Terminal"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the header**

In `components/header.tsx`, add the import:
```ts
import { AddKnowledgeButton } from "@/components/add-knowledge-button";
```

Replace:
```tsx
        <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm">
          <WifiOff className="size-4" />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
```
with:
```tsx
        <AddKnowledgeButton />

        <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm">
          <WifiOff className="size-4" />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/add-knowledge-button.tsx components/header.tsx
git commit -m "feat: add Add Knowledge button to header"
```

---

### Task 6: Full verification (no push)

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `cli-providers`, `provider-terminal`, and `rag-inbox` suites

- [ ] **Step 2: Lint**

Run: `npx eslint .`
Expected: no errors

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Confirm branch state and that nothing was pushed**

```bash
git status
git log --oneline main..HEAD
git branch -vv
```
Expected: working tree clean, commits from Tasks 0–5 present, branch has no upstream (not pushed).

- [ ] **Step 5: Manual verification (macOS, dev server)**

Run: `npm run dev`, open the app, click **Add Knowledge**, pick a small text file, choose "Claude Code" (or whichever CLI is installed), submit. Expected: a Terminal.app window opens, `cd`'d into the repo, either running `claude "Add the files in .rag-inbox/ to the knowledge base."` (if `claude` is on PATH) or the install command (if not). Confirm the file actually landed in `.rag-inbox/`.

No commit for this task — verification only.
