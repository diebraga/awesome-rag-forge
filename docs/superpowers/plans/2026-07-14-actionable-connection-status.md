# Actionable Connection Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing "database not configured" / "database unreachable" screens an in-app "Open setup terminal" + "Check again" action, and document (without building) the Tauri desktop-packaging direction for future sessions.

**Architecture:** One new pure-logic module (`lib/setup-terminal.ts`, mirrors `lib/ollama.ts`'s `canAutoStartOllama`/`startOllamaLocally` pattern exactly), one new local-only API route reusing the existing `getLocalRequestFailure` guard, one new shared client component, two one-line edits to existing screens, one new doc, and six one-line index updates.

**Tech Stack:** Next.js App Router route handlers, React client component (`components/ui/button`), Vitest, `node:child_process.spawn` + `osascript` (macOS).

## Global Constraints

- Terminal-based masked-input `npm run setup` stays unchanged — this plan only adds a trigger for it, never reimplements secret handling (spec Non-goals).
- No Tauri/Electron scaffolding, no `src-tauri/`, no Rust, no packaging config (spec Non-goals).
- No changes to `public-site/`, `vercel.json`, or anything in the production deploy path — everything built here lives under `app/api/*` and `app/*.tsx`, which never ship to Vercel per the existing `docs/deployment.md` boundary (spec Context #5).
- macOS-only for the terminal-open button; Windows/Linux keep existing static instructions plus the platform-agnostic "Check again" button (spec Judgment Calls).
- No interactive review checkpoints — execute straight through per this task's explicit instruction (spec Judgment Calls).

---

### Task 1: `lib/setup-terminal.ts` — gating logic + terminal launcher

**Files:**
- Create: `lib/setup-terminal.ts`
- Test: `lib/setup-terminal.test.ts`

**Interfaces:**
- Consumes: `node:child_process.spawn` (stdlib only, no new dependency).
- Produces: `canOpenSetupTerminal(opts?: { platform?: NodeJS.Platform; isProduction?: boolean }): boolean`, `openSetupTerminal(repoRoot?: string): Promise<void>`, `SETUP_TERMINAL_UNAVAILABLE_ERROR: string` — all consumed by Task 2's route.

- [ ] **Step 1: Write the failing test**

```ts
// lib/setup-terminal.test.ts
import { describe, expect, test } from "vitest";
import { canOpenSetupTerminal } from "./setup-terminal";

describe("canOpenSetupTerminal", () => {
  test("true on macOS outside production", () => {
    expect(canOpenSetupTerminal({ platform: "darwin", isProduction: false })).toBe(true);
  });

  test("false in production", () => {
    expect(canOpenSetupTerminal({ platform: "darwin", isProduction: true })).toBe(false);
  });

  test("false on non-macOS platforms", () => {
    expect(canOpenSetupTerminal({ platform: "linux", isProduction: false })).toBe(false);
    expect(canOpenSetupTerminal({ platform: "win32", isProduction: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/setup-terminal.test.ts`
Expected: FAIL — `lib/setup-terminal.ts` does not exist yet (`Cannot find module './setup-terminal'`).

- [ ] **Step 3: Write the implementation**

```ts
// lib/setup-terminal.ts
import { spawn } from "node:child_process";

export const SETUP_TERMINAL_UNAVAILABLE_ERROR =
  "Opening a terminal automatically is only supported on macOS outside production. Run `npm run setup` in your own terminal instead.";

/**
 * Whether this server process is allowed to open a terminal on the host
 * machine running it. Deliberately conservative, mirroring
 * canAutoStartOllama() in lib/ollama.ts: macOS only (osascript), and never
 * in production, so a deployed instance (which never ships this route's
 * code anyway, since app/api never reaches Vercel — see docs/deployment.md)
 * can't be tricked into spawning a GUI process on its host.
 */
export function canOpenSetupTerminal({
  platform = process.platform,
  isProduction = process.env.NODE_ENV === "production",
}: { platform?: NodeJS.Platform; isProduction?: boolean } = {}) {
  return !isProduction && platform === "darwin";
}

/**
 * Opens Terminal.app, cd's into this repo's root, and runs `npm run setup`.
 * Only ever called after canOpenSetupTerminal() and the caller's local-
 * request guard both pass. Rejects with a plain Error if osascript itself
 * fails (e.g. Terminal.app unavailable) — the caller decides how to surface
 * that, matching startOllamaLocally()'s pattern of only ever throwing
 * safe-to-display messages.
 */
export function openSetupTerminal(repoRoot: string = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = `tell application "Terminal" to do script "cd ${JSON.stringify(repoRoot)} && npm run setup"`;
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

Run: `npx vitest run lib/setup-terminal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/setup-terminal.ts lib/setup-terminal.test.ts
git commit -m "feat: add setup-terminal gating logic and launcher

Mirrors lib/ollama.ts's canAutoStartOllama/startOllamaLocally pattern:
macOS-only, non-production-only, no new dependency."
```

---

### Task 2: `POST /api/setup/open-terminal` route

**Files:**
- Create: `app/api/setup/open-terminal/route.ts`

**Interfaces:**
- Consumes: `getLocalRequestFailure` from `@/lib/local-request-guard` (existing), `logRouteError` from `@/lib/api-errors` (existing), `canOpenSetupTerminal`/`openSetupTerminal`/`SETUP_TERMINAL_UNAVAILABLE_ERROR` from Task 1's `@/lib/setup-terminal`.
- Produces: `POST /api/setup/open-terminal` — `{ ok: true }` on success, `{ ok: false, error: string }` with 400/403/500, consumed by Task 3's client component via `fetch`.

- [ ] **Step 1: Confirm the imports this route needs already exist**

Run: `grep -n "export function logRouteError" lib/api-errors.ts`
Expected: a match — confirms the exact import path/name used by `/api/ollama/start/route.ts` is available to reuse here too.

- [ ] **Step 2: Write the route**

```ts
// app/api/setup/open-terminal/route.ts
import { NextResponse } from "next/server";
import { logRouteError } from "@/lib/api-errors";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import {
  canOpenSetupTerminal,
  openSetupTerminal,
  SETUP_TERMINAL_UNAVAILABLE_ERROR,
} from "@/lib/setup-terminal";

/**
 * Opens a terminal running `npm run setup` on this machine. Deliberately
 * does NOT go through getTestingApiReadinessFailure() like other local
 * routes: that helper requires the database to already be reachable, which
 * defeats the purpose here — this route exists specifically for the moment
 * the database is NOT yet configured or reachable, before
 * ENABLE_TESTING_SURFACE or APP_API_KEY are necessarily set up either. The
 * local-request guard (loopback host + origin) is the only gate that still
 * applies, matching the Ollama helper routes' CSRF/DNS-rebinding
 * protection.
 *
 * @swagger
 * /api/setup/open-terminal:
 *   post:
 *     summary: Open a terminal running `npm run setup` on this machine
 *     description: Local-only, macOS-only, non-production. Never targets any machine other than the one this server process is already running on.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Terminal opened
 *       400:
 *         description: Not available on this platform/environment
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       500:
 *         description: Failed to open a terminal
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  if (!canOpenSetupTerminal()) {
    return NextResponse.json({ ok: false, error: SETUP_TERMINAL_UNAVAILABLE_ERROR }, { status: 400 });
  }

  try {
    await openSetupTerminal();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("POST /api/setup/open-terminal", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to open a terminal." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this file.

- [ ] **Step 4: Commit**

```bash
git add app/api/setup/open-terminal/route.ts
git commit -m "feat: add POST /api/setup/open-terminal route

Local-only (loopback guard), macOS-only, non-production-only. Skips the
usual DB-readiness gate on purpose -- this route exists for when the
database is NOT yet reachable."
```

---

### Task 3: `<SetupActions />` shared client component

**Files:**
- Create: `app/setup-actions.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (existing, `variant="outline"`/`size="sm"` confirmed valid), `Terminal`/`RefreshCw` icons from `lucide-react` (existing dependency), `POST /api/setup/open-terminal` from Task 2.
- Produces: `SetupActions` component, consumed by Task 4's two screens.

- [ ] **Step 1: Confirm `lucide-react` exports the icons used**

Run: `grep -n "^export" node_modules/lucide-react/dist/lucide-react.d.ts 2>/dev/null | grep -iE "Terminal|RefreshCw" | head -5`
Expected: both `Terminal` and `RefreshCw` present (lucide-react ships both as standard icons).

- [ ] **Step 2: Write the component**

```tsx
// app/setup-actions.tsx
"use client";

import { useState } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SetupActions() {
  const [status, setStatus] = useState<"idle" | "opening" | "opened" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleOpenTerminal() {
    setStatus("opening");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/setup/open-terminal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setErrorMessage(data.error ?? "Unable to open a terminal.");
        setStatus("error");
        return;
      }
      setStatus("opened");
    } catch {
      setErrorMessage("Unable to reach this server.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <p className="text-sm font-semibold text-black">Run setup</p>
      <p className="text-sm leading-6 text-black/70">
        Opens a terminal in this project and runs <code>npm run setup</code>, which prompts for
        each value with masked input and writes straight to <code>.env</code> — nothing is typed
        here, nothing is sent to this page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleOpenTerminal} disabled={status === "opening"} size="sm">
          <Terminal className="size-4" />
          {status === "opening" ? "Opening…" : "Open setup terminal"}
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          <RefreshCw className="size-4" />
          Check again
        </Button>
      </div>
      {status === "opened" && (
        <p className="text-sm text-black/60">
          Terminal opened. Finish setup there, then click &quot;Check again&quot;.
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-600">
          {errorMessage} Run <code>npm run setup</code> in your own terminal instead, then click
          &quot;Check again&quot;.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/setup-actions.tsx
git commit -m "feat: add shared SetupActions component

Open setup terminal + Check again buttons, shared by both database-error
screens. Follows app/testing-api-auth-prompt.tsx's existing client-
component conventions."
```

---

### Task 4: Wire `SetupActions` into both database-error screens

**Files:**
- Modify: `app/database-setup-required.tsx`
- Modify: `app/database-connection-failed.tsx`

**Interfaces:**
- Consumes: `SetupActions` from Task 3's `@/app/setup-actions` (or relative `./setup-actions` — match whichever import style the two target files already use for local imports; they currently have none, so use the relative form `./setup-actions` to match this project's convention of relative imports within `app/`, confirmed by `app/page.tsx` using `"./database-connection-failed"` etc.).
- Produces: nothing new — this is the final integration point.

- [ ] **Step 1: Add the import and component to `database-setup-required.tsx`**

In `app/database-setup-required.tsx`, add the import at the top:

```tsx
import { SetupActions } from "./setup-actions";
```

Then insert `<SetupActions />` immediately after the closing `</div>` of the "Optional file bucket" block and before the closing `</div>` of the final "Supported today... Not supported today" block, i.e. replace:

```tsx
        <div className="space-y-2 text-sm leading-6 text-black/60">
          <p>
            Supported today: Prisma Postgres, Supabase, Neon, RDS/Postgres, local
```

with:

```tsx
        <SetupActions />

        <div className="space-y-2 text-sm leading-6 text-black/60">
          <p>
            Supported today: Prisma Postgres, Supabase, Neon, RDS/Postgres, local
```

- [ ] **Step 2: Add the import and component to `database-connection-failed.tsx`**

In `app/database-connection-failed.tsx`, add the import at the top:

```tsx
import { SetupActions } from "./setup-actions";
```

Then insert `<SetupActions />` immediately before the final closing `</section>`, i.e. replace:

```tsx
        <p className="text-sm leading-6 text-black/60">
          Supported today: Postgres-compatible databases with <code>pgvector</code>,
          such as Prisma Postgres, Supabase, Neon, RDS/Postgres, or local Postgres.
          MongoDB, SQLite, MySQL, and document databases require code changes.
        </p>
      </section>
```

with:

```tsx
        <p className="text-sm leading-6 text-black/60">
          Supported today: Postgres-compatible databases with <code>pgvector</code>,
          such as Prisma Postgres, Supabase, Neon, RDS/Postgres, or local Postgres.
          MongoDB, SQLite, MySQL, and document databases require code changes.
        </p>

        <SetupActions />
      </section>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no new errors.

- [ ] **Step 4: Manual verification — missing DATABASE_URL**

Run: `DATABASE_URL= npm run dev` (temporarily empty; do not edit `.env`), open `http://localhost:3000`.
Expected: `DatabaseSetupRequired` renders with the new "Run setup" block, showing "Open setup terminal" and "Check again" buttons below the existing content.

- [ ] **Step 5: Manual verification — click "Open setup terminal"**

Click the button in the browser.
Expected: a new Terminal.app window opens, `cd`'d into the repo root, running `npm run setup`. The UI shows "Opening…" then "Terminal opened. Finish setup there, then click 'Check again'."

- [ ] **Step 6: Manual verification — unreachable DATABASE_URL**

Set `DATABASE_URL` to a syntactically valid but unreachable value (e.g. `postgresql://user:pass@127.0.0.1:1/nonexistent`), restart `npm run dev`.
Expected: `DatabaseConnectionFailed` renders with the same "Run setup" block and working buttons.

- [ ] **Step 7: Manual verification — recovery**

Restore the real `DATABASE_URL`, restart `npm run dev`, click "Check again" (or reload).
Expected: the app renders normally (chat surface), confirming the new screens don't interfere with the working path.

- [ ] **Step 8: Commit**

```bash
git add app/database-setup-required.tsx app/database-connection-failed.tsx
git commit -m "feat: wire SetupActions into both database-error screens

Gives the existing 'database not configured' / 'database unreachable'
states an actionable next step instead of static-only instructions."
```

---

### Task 5: New doc — `docs/setup-ux-and-desktop-direction.md`

**Files:**
- Create: `docs/setup-ux-and-desktop-direction.md`

**Interfaces:**
- Consumes: nothing (pure documentation).
- Produces: link target for Task 6's index updates.

- [ ] **Step 1: Write the doc**

```markdown
# Setup UX & Desktop Packaging Direction

## Terminal-based setup stays

`npm run setup` (masked input, writes straight to `.env`, never echoed/logged) remains the
only way secrets enter this project. See [Security Considerations](security.md) for why —
short version: typing a secret into an AI assistant's chat puts it in a cloud-hosted
transcript, which is the wrong place for it regardless of how local the setup feels. This
doc does not change that boundary; it adds a convenience trigger for it.

## The in-app "Open setup terminal" trigger

The two database-error screens (`app/database-setup-required.tsx`,
`app/database-connection-failed.tsx`) now include a "Run setup" block with two actions:

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

## Desktop packaging direction: Tauri, not Electron

If this project is ever wrapped as a desktop app, the chosen direction is **Tauri**, not
Electron. Not built yet — this section records the decision so a future session doesn't
have to re-derive it.

Why Tauri: smaller installer (~10-20MB vs Electron's ~150-200MB bundled Chromium+Node),
and this project's actual runtime dependency is just "run this Next.js server plus this MCP
server as background processes" — a job Tauri's sidecar-process support already covers
without needing the whole app in Rust.

How it would work, at a glance:
- Tauri's Rust shell spawns a bundled Node.js binary as a **sidecar process** running
  `next start` (and, separately, the MCP server) — the existing Next.js/Prisma/MCP code
  runs completely unchanged inside that sidecar.
- The native window (webview) points at the sidecar's `localhost` port.
- The only genuinely new code would be the sidecar-spawn/lifecycle wiring in Rust, plus
  (optionally, later) a native command wrapping a keychain plugin (e.g.
  `tauri-plugin-keyring`) so secrets could eventually be stored in the OS keychain
  (Keychain/Credential Manager/Secret Service) instead of a plaintext `.env` — this is the
  "genuinely unbypassable" secret storage `docs/security.md` already flags as a documented
  future option, not yet built.
- Ordinary feature work (new pages, routes, Prisma models, MCP tools) would never touch the
  Rust side once the sidecar wiring exists — only new *native* capabilities (menus, tray,
  new keychain-backed secret types, a second sidecar) would.

## Production/Vercel is unaffected

None of the above changes what ships to production. This project's Vercel deployment
already only builds and serves `public-site/` (a static docs microsite) — see
[Deployment](deployment.md#the-only-thing-meant-to-be-deployed-publicly-public-site). The
new route and component live under `app/api/` and `app/`, which never reach that deploy
path today, and nothing here changes that.
```

- [ ] **Step 2: Verify all internal links resolve**

Run: `ls docs/security.md docs/deployment.md`
Expected: both exist (confirms the relative links in the new doc are valid).

- [ ] **Step 3: Commit**

```bash
git add docs/setup-ux-and-desktop-direction.md
git commit -m "docs: record setup UX trigger and Tauri desktop-packaging direction

Documents the new in-app setup-terminal trigger and records Tauri (not
Electron) as the chosen future desktop-packaging direction, without
building it -- for future agent sessions to read instead of re-deriving."
```

---

### Task 6: Link the new doc from every per-agent documentation index

**Files:**
- Modify: `CLAUDE.md`
- Modify: `GEMINI.md`
- Modify: `CODEX.md`
- Modify: `.cursorrules`
- Modify: `.windsurfrules`
- Modify: `.clinerules`

**Interfaces:**
- Consumes: `docs/setup-ux-and-desktop-direction.md` from Task 5.
- Produces: nothing — final documentation-index integration.

- [ ] **Step 1: Confirm the exact anchor line in each file**

Run: `grep -n "Post-Install Handoff" CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules`
Expected: one match per file — this is the existing index line immediately before which the new bullet will be inserted (matches the ordering already used consistently across all six files per the earlier diff).

- [ ] **Step 2: Insert the new bullet in each file**

In each of the six files, replace:

```
- [Post-Install Handoff](docs/post-install-handoff.md) — final setup message explaining UI vs. MCP capabilities.
```

with:

```
- [Setup UX & Desktop Direction](docs/setup-ux-and-desktop-direction.md) — in-app "run setup" trigger, and the Tauri desktop-packaging direction.
- [Post-Install Handoff](docs/post-install-handoff.md) — final setup message explaining UI vs. MCP capabilities.
```

(Use this exact anchor/replacement in `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `.cursorrules`, `.windsurfrules`, and `.clinerules` — all six currently contain this exact "Post-Install Handoff" line per Step 1's grep.)

- [ ] **Step 3: Verify all six were updated**

Run: `grep -l "Setup UX & Desktop Direction" CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules`
Expected: all six filenames printed.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules
git commit -m "docs: link setup-ux-and-desktop-direction.md from every agent index

One-line addition to each per-agent documentation index, same position
in all six files."
```

---

### Task 7: Final verification and PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including the new `lib/setup-terminal.test.ts`.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: succeeds with no errors (this also validates `prebuild`'s `generate:openapi` picks up the new route's `@swagger` block without error).

- [ ] **Step 3: Confirm working tree is clean and all commits are present**

Run: `git log --oneline main..HEAD` (or equivalent if already on a feature branch — see Task execution note below)
Expected: 6 commits (Tasks 1-6; Task 7 has no commit of its own, verification only), matching this plan's task list.

- [ ] **Step 4: Push and open the PR**

```bash
git branch actionable-connection-status
git push -u origin actionable-connection-status
gh pr create --title "Actionable connection status + Tauri desktop-packaging direction" --base main --head actionable-connection-status --body "$(cat <<'EOF'
## Summary
- Adds an in-app "Open setup terminal" + "Check again" action to the existing database-not-configured / database-unreachable screens, so users don't have to know to open a terminal and run `npm run setup` manually
- The new local-only route (`POST /api/setup/open-terminal`) opens a real Terminal.app window running the existing masked-input `npm run setup` script -- it never touches `.env` or handles secrets itself, macOS-only, non-production-only, gated by the same local-request guard as `/api/ollama/start`
- Documents Tauri (not Electron) as the future desktop-packaging direction in a new `docs/setup-ux-and-desktop-direction.md`, linked from all six per-agent documentation indexes -- direction only, nothing scaffolded
- No changes to production/Vercel deploy path (already `public-site`-only), no changes to the terminal-based secret-onboarding flow itself

## Test plan
- [x] `npm test` passes including new `lib/setup-terminal.test.ts`
- [x] `npm run build` succeeds
- [x] Manually verified: missing `DATABASE_URL` renders the new buttons; clicking "Open setup terminal" opens a real terminal running `npm run setup`; unreachable `DATABASE_URL` shows the same buttons; restoring a working `DATABASE_URL` + "Check again" returns to the normal app

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 5: Merge**

```bash
gh pr merge --merge
```

Expected: PR merges into `main`.

## Task execution note

Tasks 1-6 commit directly to `main` (matching this repo's existing single-branch-until-PR-time workflow, same pattern used in the Coase session this plan originated from). Task 7 retroactively creates the PR branch from the accumulated commits, exactly as done there — see that session's Task 3 for the precedent if anything about branch/PR mechanics is unclear during execution.
