# Actionable Connection Status + Desktop Packaging Direction

Date: 2026-07-14
Status: Approved for autonomous execution (no interactive review checkpoint — see Judgment Calls)

## Context

This spec closes out a cross-repo conversation that happened in a different project's (Coase's) Claude Code session, about this project (awesome-rag-forge). Summary of what was discussed and decided there:

1. **The terminal-based masked-input setup flow (`npm run setup`) stays exactly as-is.** It's a deliberate security boundary — already documented in `docs/security.md` — that keeps secrets out of AI chat transcripts and out of any web-exposed surface. Nothing in this spec touches or replaces it.
2. **What's missing today:** the app already shows a clear "database not configured" / "database unreachable" state before rendering (`app/page.tsx` → `DatabaseSetupRequired` / `DatabaseConnectionFailed`), per `docs/database.md`. But that state is static prose — the user has to know to open a terminal, run `npm run setup` themselves, then manually reload. There's no actionable next step in the UI itself.
3. **Desktop packaging direction:** if this project is ever wrapped as a desktop app, **Tauri** is the chosen direction (not Electron) — decided in the other session. This spec does **not** build that wrapper (no `src-tauri/`, no Rust, no packaging config). It only records the decision and its implications in the docs, since nothing in this codebase depends on it yet and building it now would be speculative (violates the explicit "change only what is needed" instruction this spec was requested under).
4. **A separate idea — an MCP-registration session-start hook in Coase that auto-detects/offers to clone and register this project's MCP server — was explicitly discussed, then explicitly retracted ("forget about it, undo the changes") in that other session.** It must not appear anywhere in this repo's documentation. (Confirmed nothing was ever written for it — this note exists only so a future reader doesn't reintroduce it.)
5. **Vercel/production deployment must not change.** This repo already enforces that production only ever ships `public-site/` (a static docs microsite) — see `docs/deployment.md#the-only-thing-meant-to-be-deployed-publicly-public-site` and the existing instruction-file rule: *"Production/public deployment is docs-only... Never change production deploys to run `next build` or ship `app/`, `app/api`, `/review`, MCP code, Prisma, or local setup helpers."* Everything built in this spec lives under `app/api/setup/*` and `app/*.tsx` (the full app), which already never reaches Vercel. No `vercel.json` or `public-site/` changes needed or made.

## Goal

1. Give the existing "database not configured" / "database unreachable" screens an actionable "Open Setup Terminal" action, reusing the exact `osascript`-opens-a-real-terminal pattern this project's own AI-instruction files already prescribe for assistants (`docs/security.md` step 2), now built into the app itself instead of requiring an AI assistant to do it manually.
2. Add a "Check again" action so the user doesn't have to manually reload after running setup.
3. Document the full architecture decision (points 1-5 above) in a new doc, linked from every per-agent instruction file's documentation index, so any future agent session (Claude, Codex, Gemini, Cursor, Windsurf, Cline) has this context without re-deriving it.

## Non-goals

- No credential input form anywhere in the web UI (reaffirmed, not changed).
- No Tauri/Electron scaffolding, no `src-tauri/`, no packaging config, no Rust.
- No changes to `public-site/`, `vercel.json`, or anything in the production deploy path.
- No changes to `npm run setup` / `scripts/setup-env.ts` itself — the new button launches it, doesn't reimplement it.
- No auto-polling/websocket reconnect — a manual "Check again" button is sufficient; `npm run setup` is a one-shot terminal action the user returns from.
- Windows/Linux terminal-opening is out of scope for this pass (see Judgment Calls) — those platforms get the existing static instructions plus a "Check again" button, no terminal-open button.

## Design

### 1. `lib/setup-terminal.ts` (new)

Mirrors the existing `lib/ollama.ts` pattern (`canAutoStartOllama` / `startOllamaLocally`) exactly, including the injectable-params style used for `getOllamaInstallPlan` so it's unit-testable without mocking global state:

```ts
import { spawn } from "node:child_process";

export const SETUP_TERMINAL_UNAVAILABLE_ERROR =
  "Opening a terminal automatically is only supported on macOS outside production. Run `npm run setup` in your own terminal instead.";

/**
 * Whether this server process is allowed to open a terminal on the host
 * machine running it. Deliberately conservative, mirroring
 * canAutoStartOllama(): macOS only (osascript), and never in production, so
 * a deployed instance (which never ships this route's code anyway, since
 * app/api never reaches Vercel — see docs/deployment.md) can't be tricked
 * into spawning a GUI process on its host.
 */
export function canOpenSetupTerminal({
  platform = process.platform,
  isProduction = process.env.NODE_ENV === "production",
}: { platform?: NodeJS.Platform; isProduction?: boolean } = {}) {
  return !isProduction && platform === "darwin";
}

/**
 * Opens Terminal.app, cd's into this repo's root, and runs `npm run setup`.
 * Only ever called after canOpenSetupTerminal() and the local-request guard
 * both pass. Throws SETUP_TERMINAL_UNAVAILABLE_ERROR-shaped errors are not
 * expected here (callers check canOpenSetupTerminal() first) — this can
 * still reject if osascript itself fails (e.g. Terminal.app unavailable),
 * which the route surfaces as-is, matching startOllamaLocally()'s pattern
 * of only ever throwing safe-to-display messages.
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

### 2. `app/api/setup/open-terminal/route.ts` (new)

```ts
import { NextResponse } from "next/server";
import { logRouteError } from "@/lib/api-errors";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { canOpenSetupTerminal, openSetupTerminal, SETUP_TERMINAL_UNAVAILABLE_ERROR } from "@/lib/setup-terminal";

/**
 * Opens a terminal running `npm run setup` on this machine. Deliberately
 * does NOT go through getTestingApiReadinessFailure() like other local
 * routes: that helper requires the database to already be reachable, which
 * defeats the purpose here — this route exists specifically for the moment
 * the database is NOT yet configured or reachable, before ENABLE_TESTING_SURFACE
 * or APP_API_KEY are necessarily set up either. The local-request guard
 * (loopback host + origin) is the only gate that still applies, matching the
 * Ollama helper routes' CSRF/DNS-rebinding protection.
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

(`logRouteError` and the `@/lib/api-errors` import path already exist and are used identically by `/api/ollama/start/route.ts`.)

### 3. `app/setup-actions.tsx` (new client component)

Shared by both database-error screens. Follows `app/testing-api-auth-prompt.tsx`'s existing conventions (`"use client"`, local `useState`, `Button`/`Input` from `components/ui`, no new dependencies):

```tsx
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
          Terminal opened. Finish setup there, then click "Check again".
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-600">
          {errorMessage} Run <code>npm run setup</code> in your own terminal instead, then click
          "Check again".
        </p>
      )}
    </div>
  );
}
```

Exact `Button`/`Input` prop shapes will be confirmed against `components/ui/button.tsx` during implementation (variant/size names) rather than guessed here.

### 4. Wire into the two existing screens

`app/database-setup-required.tsx` and `app/database-connection-failed.tsx` each get one new line — `<SetupActions />` — added after their existing content, no restructuring of what's already there.

### 5. New doc: `docs/setup-ux-and-desktop-direction.md`

Captures Context points 1-5 above as the permanent record. Structure:
- "Terminal-based setup stays" (links to `docs/security.md`, no duplication)
- "The new in-app trigger" (what this spec built, and why it's not a security regression — it launches the same script, doesn't reimplement secret handling)
- "Desktop packaging: Tauri, not Electron" (the decision, the sidecar-process reasoning, the future OS-keychain-plugin upgrade path — explicitly marked as direction, not yet built)
- "Production/Vercel is unaffected" (reaffirms the existing `public-site`-only deploy boundary)

### 6. Documentation index updates

One new bullet added to the "Documentation index" list in `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `.cursorrules`, `.windsurfrules`, `.clinerules` (all six — `.clinerules` already has a minor pre-existing drift from the others missing two Vercel bullets; out of scope to fix here, not touched):

```
- [Setup UX & Desktop Direction](docs/setup-ux-and-desktop-direction.md) — in-app "run setup" trigger, and the Tauri desktop-packaging direction.
```

`AGENTS.md` itself is not touched — it holds portable-brain-integration content specifically, not the per-file documentation index.

## Testing

Following the existing `lib/ollama.test.ts` convention (injectable params, no global mocking):

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

`openSetupTerminal()` itself (actually spawning `osascript`) is not unit-tested — same as `startOllamaLocally()`, which has no test either; it's a thin OS-process wrapper, verified manually.

Manual verification:
- `npm run build` succeeds (typecheck/lint gate).
- `npm test` passes including the new test file.
- Manually unset `DATABASE_URL`, run `npm run dev`, confirm `DatabaseSetupRequired` renders with the new "Open setup terminal" / "Check again" buttons, clicking "Open setup terminal" actually opens Terminal.app running `npm run setup` in the repo root.
- Manually point `DATABASE_URL` at an unreachable host, confirm `DatabaseConnectionFailed` renders the same buttons and behaves the same way.
- Restore a working `DATABASE_URL`, click "Check again", confirm the app renders normally again.

## Judgment Calls (made autonomously per this task's explicit "don't ask me any question" instruction)

- **macOS-only for the terminal-open button.** The project's own docs already scope this exact pattern to macOS (`docs/security.md`: *"a platform where a separate terminal window can be opened (e.g. macOS via osascript)"*) — treating this as an existing, already-approved scope rather than a new limitation needing sign-off. Windows/Linux keep the static-instructions fallback that already exists today; the "Check again" button (platform-agnostic) still ships for them.
- **No Tauri scaffolding built now.** "Use tauri not electron" is treated as recording the decision for when a desktop wrapper is actually built, not an instruction to scaffold one in this pass — the concrete, testable ask in this message ("at first impact... show the connection... handle errors") describes the connection-status feature, not a desktop app, and Ponytail's "does this need to exist at all" rung says skip speculative work.
- **No interactive spec/plan review checkpoint.** Per "prompt to yourself, without asking me any question," this spec is written, self-reviewed, and proceeds straight to the implementation plan and execution without pausing for approval — a deviation from the brainstorming skill's normal user-review gate, made explicitly at this task's request.
