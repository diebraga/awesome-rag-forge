# Root-Level Connection Gate (Replaces Terminal-First Setup Flow)

Date: 2026-07-14
Status: Approved (design confirmed in conversation), pending spec review

## Context

The previous iteration (`docs/superpowers/specs/2026-07-14-actionable-connection-status-design.md`,
already shipped in PR #2) added an "Open setup terminal" button to the existing
per-page database-error screens. User feedback after using it: opening a terminal
still requires the user to interact with a terminal, which doesn't meaningfully
reduce the friction a non-technical user experiences — it relocates the problem,
it doesn't solve it. This spec replaces that as the *primary* path with a real
in-browser connection form, while keeping the terminal-based `npm run setup`
flow available as a secondary/fallback option (unchanged, still the only way
this project's other secrets — provider API keys, storage credentials — get
set, and still documented as such).

Explicit new requirements from this conversation:

1. Before a database connection exists, the user sees **only** a connection
   screen — no navigation, no other UI chrome, on **any** route, not just `/`.
2. That screen has a real `DATABASE_URL` input field. Bucket credentials are
   optional and do not block connecting; they can be configured after.
3. Once connected, the app works normally, **without restarting the server**.
4. If the app ever becomes disconnected again (real outage, or a manual
   "Disconnect" testing control), the user is sent back to the same gate —
   automatically, on whatever route they're on.
5. Remove the `/review` page entirely (not just relocate the disconnect
   toggle off of it) — confirmed explicitly after flagging that `/review` is
   pre-existing product functionality (a local-only dashboard for
   approving/rejecting pending `RagChunk`/`HarnessRule` rows), not something
   added this session. The "Disconnect" testing control needs a new home
   that doesn't depend on a whole page existing — see Design §6.

## Security note (stated once, then followed either way per user's decision)

This project's docs (`docs/security.md`, `docs/environment-variables.md`)
establish a strong existing rule: never ask a user to paste a secret into an
AI assistant's chat, and use masked terminal input for `DATABASE_URL`/storage
credentials specifically so nothing transits through a channel an AI
assistant might read. A browser form is a different channel than an AI
assistant's chat, but it is not identical to a terminal's masked stdin — the
submitted value is visible in the browser's DevTools Network tab during
submission. For a strictly local, single-user tool this is an accepted
trade-off per explicit user direction in this conversation. Mitigations kept
regardless: the input uses `type="password"`, the server action never echoes
the value back in its response, never logs it, and the acting agent
(Claude, building and testing this) will not read `.env`, will not inspect
this endpoint's request body, and will not screenshot the filled-in field —
verification of success is done via the resulting (masked) connection status
only, same discipline already established for the existing masked-URL hint.

## Goal

1. `app/layout.tsx` becomes the single source of truth for the connection
   gate: if the database isn't reachable, render *only* the gate — no
   `Header`, no page content — regardless of which route was requested.
2. Remove the now-redundant per-page connection checks in `app/page.tsx`,
   `app/portable-brain/page.tsx`, `app/harness/page.tsx`,
   `app/api-docs/page.tsx`, `app/collections/page.tsx`, and
   `app/collections/[collectionId]/page.tsx` — the layout now guarantees
   they only ever render when connected, so the check there was already
   redundant defense-in-depth, not the source of truth. Removing it collapses
   6 duplicated call sites into 1 (a 7th, `app/review/page.tsx`, is deleted
   outright — see §6).
3. New connection form (`DATABASE_URL` input, optional collapsed bucket
   fields) replaces the old "Open setup terminal"-first framing on the gate
   screen. The terminal button remains, secondary.
4. Submitting the form connects **without a server restart**: writes to
   `.env` (persisted) and updates the live process's connection immediately
   (in-memory), so the very next request already has it.
5. Any future disconnect (real outage, or the new Header-based "Disconnect"
   testing control — see §6) is caught by the same layout-level check and
   returns the user to the same gate, from whatever route they were on.
6. Delete `/review` entirely (page, its own connection check, and the
   dev-disconnect-toggle component that lived there) and move the
   "Disconnect" testing control into the persistent `Header` component
   instead, so it doesn't depend on a whole page existing. See §6 for what
   does and doesn't move with it.

## Non-goals

- Not touching how provider API keys or bucket credentials are set (still
  `npm run setup:provider` / manual `.env` edit / configured-later via the
  existing patterns) — only `DATABASE_URL` gets the new inline form treatment
  for now, per explicit scope ("the bucket is optional... configured later").
- Not removing `npm run setup` or the terminal button — kept as a fallback,
  and it's still the only path for secrets this spec doesn't touch.
- Not adding authentication/authorization to the new form-submission route
  beyond the existing `getLocalRequestFailure` loopback guard — same posture
  as every other local-only mutating route in this project
  (`/api/ollama/start`, `/api/setup/open-terminal`, `/api/dev/toggle-disconnect`).
- Not persisting the "simulate disconnect" state across the reconnect Proxy
  work — they're independent mechanisms that happen to compose correctly
  (simulate-disconnect still short-circuits `getDatabaseConnectionStatus()`
  before the real check runs, same as before).
- Not touching the MCP-server-side review/approval workflow (`RagReview`
  table, `mcp/rag-manager/review-policy.ts`, the propose → approve → write
  contract) or its documentation — only the `/review` *web page* is deleted;
  the underlying concept it was a secondary UI for is untouched and stays
  the primary, documented way knowledge gets approved.

## Design

### 1. Dynamic Prisma reconnect without a server restart

Today, `lib/prisma.ts` builds one `PrismaClient` at module load, cached on
`globalThis` (surviving HMR), from whatever `getDatabaseUrl()` (which reads
`process.env.DATABASE_URL`) returned at that moment. `process.env.DATABASE_URL`
*can* be mutated live in Node — a later `process.env.DATABASE_URL = "..."`
really does change what subsequent reads see — but the already-constructed
`PrismaClient`/connection pool does not know to rebuild itself just because
the env var changed underneath it.

Rejected approach: convert the exported `prisma` from a plain `const` to a
`getPrismaClient()` function that always resolves the current client. Correct
in principle, but it means every existing `import { prisma } from "@/lib/prisma"`
call site (a dozen+ files: API routes, `/review`, the seed script, the MCP
server) would need to change from `prisma.ragCollection...` to
`getPrismaClient().ragCollection...`. That's a broad rewrite of currently-working
code for a problem that doesn't require touching those call sites at all.

Chosen approach: keep `export const prisma = ...` as the exact same import
surface, but make it a `Proxy` that re-resolves the underlying client (rebuilding
it if the connection string has changed since the last build) on every property
access:

```ts
// lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/database-config";

const FALLBACK_URL = "postgresql://missing:missing@127.0.0.1:1/missing";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
  prismaClientUrl?: string;
};

function currentClient(): PrismaClient {
  const url = getDatabaseUrl() ?? FALLBACK_URL;
  if (!globalForPrisma.prismaClient || globalForPrisma.prismaClientUrl !== url) {
    const outgoing = globalForPrisma.prismaClient;
    globalForPrisma.prismaClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    globalForPrisma.prismaClientUrl = url;
    // Best-effort cleanup of the replaced client; never let this block or
    // throw into the caller that's just trying to get the new client.
    outgoing?.$disconnect().catch(() => {});
  }
  return globalForPrisma.prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(currentClient(), prop, receiver);
  },
});
```

Every existing consumer of `prisma` is unaffected — same import, same property
access, zero call-site changes. `getDatabaseConnectionStatus()` (already reads
`process.env.DATABASE_URL` fresh per call) and this Proxy both naturally pick
up a live-mutated `process.env.DATABASE_URL` on the very next call, no restart.

### 2. Connect server action

New `app/connect-database-action.ts` (server action, colocated with the gate
UI that uses it — this project's existing convention, e.g. `app/review/actions.ts`):

```ts
"use server";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { upsertEnvVar } from "@/scripts/env-file";
import { canSimulateDisconnect } from "@/lib/dev-disconnect"; // reused: same "never in production" gate shape

export type ConnectResult = { ok: true } | { ok: false; error: string };

export async function connectDatabaseAction(formData: FormData): Promise<ConnectResult> {
  if (!canSimulateDisconnect()) {
    // Same non-production gate as every other local-only mutating action in
    // this project. Named for its original use; the check itself
    // (`process.env.NODE_ENV !== "production"`) is generic enough to reuse
    // as-is rather than duplicating the same one-line check under a second
    // name.
    return { ok: false, error: "Configuring the database from the UI is only available outside production." };
  }

  const url = String(formData.get("databaseUrl") ?? "").trim();
  if (!url) {
    return { ok: false, error: "Enter a DATABASE_URL." };
  }

  const envPath = join(process.cwd(), ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  writeFileSync(envPath, upsertEnvVar(current, "DATABASE_URL", url));
  process.env.DATABASE_URL = url;

  return { ok: true };
}
```

Never echoes `url` back in the `ConnectResult` — success is just `{ ok: true }`;
the caller re-fetches connection status (which will now succeed or fail
against the real database) rather than trusting the write blindly.

Bucket credentials are a **separate action**, not a branch inside this one —
they're optional, non-blocking, and conceptually distinct (three fields, no
connectivity check to run afterward), so a second single-purpose function is
clearer than one function branching on which fields are present:

```ts
// app/connect-database-action.ts (continued)
export async function saveBucketCredentialsAction(formData: FormData): Promise<ConnectResult> {
  if (!canSimulateDisconnect()) {
    return { ok: false, error: "Configuring storage from the UI is only available outside production." };
  }

  const fields: Array<[string, FormDataEntryValue | null]> = [
    ["STORAGE_BUCKET", formData.get("storageBucket")],
    ["STORAGE_ACCESS_KEY_ID", formData.get("storageAccessKeyId")],
    ["STORAGE_SECRET_ACCESS_KEY", formData.get("storageSecretAccessKey")],
  ];

  const envPath = join(process.cwd(), ".env");
  let current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  for (const [key, value] of fields) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) current = upsertEnvVar(current, key, trimmed);
  }
  writeFileSync(envPath, current);

  return { ok: true };
}
```

Blank bucket fields are simply skipped (not written as empty strings) — a
user can fill in one of the three now and the rest later without clobbering
anything already set.

### 3. Gate UI — one card, just the inputs

Deliberately minimal per explicit direction: no explanatory prose blocks, no
"supported databases" lists, no terminal fallback link, no separate masked-
URL paragraph — a single centered card with the `DATABASE_URL` field and the
three (optional) bucket fields, nothing else. The `SetupActions`/"Open setup
terminal" component and the old two screens (`app/database-setup-required.tsx`,
`app/database-connection-failed.tsx`) are all deleted, not reused or demoted
to secondary. `npm run setup` remains fully available as a plain CLI path —
this only removes its in-UI pointer, not the script itself.

`app/connection-gate.tsx` (server component, only receives `maskedUrl` — no
other props):

```tsx
export function ConnectionGate({ maskedUrl }: { maskedUrl?: string }) {
  return (
    <main className="flex h-full items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-black/10 bg-black/[0.02] p-6">
        <h1 className="text-lg font-semibold text-black">Connect a database</h1>
        <ConnectionForm maskedUrl={maskedUrl} />
      </div>
    </main>
  );
}
```

`app/connection-form.tsx` (`"use client"`, the only interactive piece):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectDatabaseAction, saveBucketCredentialsAction } from "./connect-database-action";

export function ConnectionForm({ maskedUrl }: { maskedUrl?: string }) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [bucketSaved, setBucketSaved] = useState(false);

  async function handleConnect(formData: FormData) {
    setConnecting(true);
    setConnectError(null);
    const result = await connectDatabaseAction(formData);
    if (!result.ok) {
      setConnecting(false);
      setConnectError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleSaveBucket(formData: FormData) {
    const result = await saveBucketCredentialsAction(formData);
    setBucketSaved(result.ok);
  }

  return (
    <div className="space-y-5">
      <form action={handleConnect} className="space-y-2">
        <label htmlFor="databaseUrl" className="block text-sm font-medium text-black">
          Database URL
        </label>
        <Input
          id="databaseUrl"
          name="databaseUrl"
          type="password"
          placeholder={maskedUrl ?? "postgresql://user:password@host:5432/database"}
          required
        />
        {connectError && <p className="text-sm text-red-600">{connectError}</p>}
        <Button type="submit" disabled={connecting} className="w-full">
          {connecting ? "Connecting…" : "Connect"}
        </Button>
      </form>

      <form action={handleSaveBucket} className="space-y-2 border-t border-black/10 pt-4">
        <p className="text-sm font-medium text-black">Bucket (optional)</p>
        <Input name="storageBucket" placeholder="Bucket name" />
        <Input name="storageAccessKeyId" type="password" placeholder="Access key ID" />
        <Input name="storageSecretAccessKey" type="password" placeholder="Secret access key" />
        <Button type="submit" variant="outline" className="w-full">
          {bucketSaved ? "Saved" : "Save bucket"}
        </Button>
      </form>
    </div>
  );
}
```

The `maskedUrl` hint (from the existing `getDatabaseConnectionStatus()`
result) becomes the `DATABASE_URL` field's placeholder instead of a separate
paragraph — visible without adding another block to the card. On successful
connect, `router.refresh()` re-runs the layout's server-side connection
check on the same route the user was already on — no full page reload, no
restart. Bucket fields submit independently of the database field/button and
never block "Connect."

### 4. Layout-level gating

```tsx
// app/layout.tsx (relevant portion)
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const database = await getDatabaseConnectionStatus();

  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col overflow-hidden bg-white">
        {database.ok ? (
          <>
            <Header testingSurfaceEnabled={isTestingSurfaceEnabled()} />
            {isDeveloperMode() && <DeveloperModeBanner />}
            {isTestingSurfaceEnabled() && <TestingApiAuthPrompt />}
            <div className="relative z-0 min-h-0 flex-1">{children}</div>
          </>
        ) : (
          <ConnectionGate status={database} />
        )}
      </body>
    </html>
  );
}
```

`{children}` is structurally not rendered at all when disconnected — this is
what makes "can't navigate anywhere without a connection" actually true
(Next.js still resolves the requested route's `page.tsx` server-side before
handing control to the layout, but its output is simply discarded/never
reaches the response; no data it fetches is sent to the client either).

### 5. Removing the 6 redundant per-page checks

Each of `app/page.tsx`, `app/portable-brain/page.tsx`, `app/harness/page.tsx`,
`app/api-docs/page.tsx`, `app/collections/page.tsx`, and
`app/collections/[collectionId]/page.tsx` currently starts with:

```ts
const database = await getDatabaseConnectionStatus();
if (!database.ok) {
  return database.reason === "missing" ? <DatabaseSetupRequired /> : <DatabaseConnectionFailed />;
}
```

This block is deleted from all six. The layout now guarantees none of them
render unless already connected, so this was duplicated defense-in-depth,
not the actual source of truth — removing it collapses 6 call sites into the
1 in `app/layout.tsx`, which is the actual goal ("single source of truth"),
not merely "also allowed to delete code."

`app/database-setup-required.tsx` and `app/database-connection-failed.tsx`
(the two screens themselves) are superseded by `app/connection-gate.tsx` and
deleted — the "missing" vs. "connection" distinction becomes framing inside
the one gate component instead of two separate page components, since both
cases now show the same form either way (a missing URL and an unreachable
URL both need "enter a working DATABASE_URL").

### 6. Deleting `/review`, and where its testing control moves

`/review` is confirmed-intentional deletion: the whole route, not just the
disconnect toggle placed there in the prior spec. What that means precisely:

**Deleted:**
- `app/review/page.tsx`, `app/review/dev-disconnect-toggle.tsx` — the page
  and the toggle component that lived only for this page.
- `app/review/actions.ts` — checked first: `approveChunkAction`,
  `rejectChunkAction`, `approveHarnessRuleAction`, `rejectHarnessRuleAction`
  are consumed *only* by `app/review/page.tsx` (verified by grepping every
  `.ts`/`.tsx` file in the repo for those four names — no other file
  imports them), so this can be deleted outright rather than relocated.
- The `/review` nav entry in `components/header.tsx`.

**Not deleted — genuinely shared, still needed elsewhere:**
- `lib/local-review-guard.ts` (`assertLocalReviewMode`/
  `getLocalReviewModeFailure`) is *also* imported by
  `app/collections/actions.ts` for its unrelated soft-archive action. Stays
  exactly as-is.
- The underlying MCP-server-side review/approval *workflow* (`RagReview`
  table, `mcp/rag-manager/review-policy.ts`, propose → approve → write via
  MCP tools) is completely unrelated to the `/review` *web page* — it's the
  primary way knowledge gets approved, the page was always a secondary local
  convenience for the same underlying actions. Not touched by this spec.

**The "Disconnect" testing control moves to `components/header.tsx`:** a
small button (reusing the existing `/api/dev/toggle-disconnect` route
unchanged — that route was never `/review`-specific, just called from
there), added to the nav that's already inside `Header`. Confirming the
part worth stating plainly: `<Header>` itself is never rendered at all while
disconnected — per Design §4, `app/layout.tsx` renders *either* `<Header>` +
`{children}` (when `database.ok`) *or* `<ConnectionGate>` (when not), never
both, never partially. So there is no state where the Disconnect button, nav
links, branding, or any other header item is visible without an active
connection — nothing in the header exists to show. Clicking Disconnect calls
the route then `router.refresh()`, which the layout's connection check picks
up on the next render, swapping straight to the gate. `Header` needs to
become a small client component wrapper for this one interactive piece (it
already receives `testingSurfaceEnabled` as a prop from the server-rendered
layout, so this follows the same existing shape, not a new pattern).

**Docs that describe `/review` as a real, available feature** — not the
general MCP review/approval concept, which stays valid — get the `/review`-
specific sentences removed or reworded: `docs/architecture.md`,
`docs/database.md`, `docs/overview.md`, `docs/mcp-server.md`,
`docs/testing-surface.md`, `docs/security.md`, `README.md`, and the
`/review`-specific bullet already present in `CLAUDE.md`/`GEMINI.md`/
`CODEX.md`/`.cursorrules`/`.windsurfrules`/`.clinerules` (the "Never add a
write path... beyond two explicit exceptions" rule, which needs to drop the
now-nonexistent `/review` exception and keep the `POST /api/feedback` one).
Exact wording is decided at plan-writing time per file, not enumerated here
— this spec's job is to establish that this cleanup is in scope, not to
pre-write every doc sentence.

## Testing

- `lib/prisma.test.ts` (new): verify the Proxy rebuilds when
  `getDatabaseUrl()`'s return value changes between calls, and does *not*
  rebuild (same client instance) when it's unchanged — using a fake/mocked
  `getDatabaseUrl` via `vi.mock`, not a real Postgres connection.
- `scripts/env-file.test.ts` already exists and already covers
  `upsertEnvVar` — no new test needed there, `connectDatabaseAction` is a
  thin wrapper around it.
- No test for `connectDatabaseAction` itself touching real `.env`/filesystem
  (would require a temp-file harness disproportionate to what this action
  does); verified manually instead, same as every other local-only route in
  this project (`/api/setup/open-terminal`, `/api/dev/toggle-disconnect` had
  no route-level tests either — see prior spec).
- Manual verification: unset `DATABASE_URL` entirely, confirm every route
  (`/`, `/collections`, `/harness`, `/portable-brain`, `/api-docs`) shows
  only the gate, no `Header`/nav. Confirm `/review` itself now 404s (route
  deleted). Submit a working `DATABASE_URL` through the form, confirm the
  app becomes usable *without restarting the dev server*. Use the new
  Header "Disconnect" button, confirm every route falls back to the gate
  again immediately.

## Open questions

None — scope and the security trade-off were both explicitly confirmed by
the user in conversation before this spec was written.
