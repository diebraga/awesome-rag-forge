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
UI that uses it — this project's existing convention, e.g. `app/review/actions.ts`).
One action for all five fields, matching the mockup's single "Continue"
button — only `databaseUrl` is required, the other four are written
if-and-only-if non-blank:

```ts
"use server";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { upsertEnvVar } from "@/scripts/env-file";
import { canSimulateDisconnect } from "@/lib/dev-disconnect"; // reused: same "never in production" gate shape
import { saveConnectionValue, type SavedConnectionValues } from "@/lib/connection-keychain";

export type ConnectResult = { ok: true } | { ok: false; error: string };

const OPTIONAL_FIELDS: Array<{
  formKey: keyof SavedConnectionValues;
  envKey: string;
}> = [
  { formKey: "storageBucket", envKey: "STORAGE_BUCKET" },
  { formKey: "storageAccessKeyId", envKey: "STORAGE_ACCESS_KEY_ID" },
  { formKey: "storageSecretAccessKey", envKey: "STORAGE_SECRET_ACCESS_KEY" },
  { formKey: "storageEndpoint", envKey: "STORAGE_ENDPOINT" },
];

export async function connectDatabaseAction(formData: FormData): Promise<ConnectResult> {
  if (!canSimulateDisconnect()) {
    // Same non-production gate as every other local-only mutating action in
    // this project. Named for its original use; the check itself
    // (`process.env.NODE_ENV !== "production"`) is generic enough to reuse
    // as-is rather than duplicating the same one-line check under a second
    // name.
    return { ok: false, error: "Configuring the database from the UI is only available outside production." };
  }

  const databaseUrl = String(formData.get("databaseUrl") ?? "").trim();
  if (!databaseUrl) {
    return { ok: false, error: "Enter a Database URL." };
  }

  const envPath = join(process.cwd(), ".env");
  let current = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  current = upsertEnvVar(current, "DATABASE_URL", databaseUrl);
  saveConnectionValue("databaseUrl", databaseUrl);

  for (const { formKey, envKey } of OPTIONAL_FIELDS) {
    const value = String(formData.get(formKey) ?? "").trim();
    if (!value) continue;
    current = upsertEnvVar(current, envKey, value);
    saveConnectionValue(formKey, value);
  }

  writeFileSync(envPath, current);
  process.env.DATABASE_URL = databaseUrl;

  return { ok: true };
}
```

Never echoes any field back in the `ConnectResult` — success is just
`{ ok: true }`; the caller re-fetches connection status (which will now
succeed or fail against the real database) rather than trusting the write
blindly. Blank optional fields are simply skipped (not written as empty
strings, not cleared from the keychain if something was already saved
there) — a user can fill in one field now and the rest later without
clobbering anything already set.

### 3. Gate UI — one card, matching the approved mockup

One form, one card, five fields, two buttons — matching the reference mockup
exactly: a header bar ("Configure Connection Gate"), `Database URL` marked
required, then `Storage Bucket Name` / `Access Key ID` / `Secret Access Key`
/ `Storage Endpoint` all marked optional, footer-right "Clear" (resets the
form fields on screen only — does not delete anything already saved) and
"Continue" (submits everything in one action). No explanatory prose, no
terminal fallback link, no separate masked-URL paragraph. The `SetupActions`/
"Open setup terminal" component and the old two screens
(`app/database-setup-required.tsx`, `app/database-connection-failed.tsx`)
are all deleted, not reused or demoted to secondary. `npm run setup` remains
fully available as a plain CLI path — this only removes its in-UI pointer,
not the script itself. `STORAGE_ENDPOINT` is a real, already-documented env
var (`docs/environment-variables.md`) for S3-compatible custom endpoints
(Cloudflare R2, MinIO) — not a new concept, just a field this form was
previously missing.

`app/connection-gate.tsx` (server component, only receives `savedValues` —
see §3a for where that comes from):

```tsx
export function ConnectionGate({ savedValues }: { savedValues: SavedConnectionValues }) {
  return (
    <main className="flex h-full items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-black/10 bg-white">
        <div className="border-b border-black/10 bg-gradient-to-b from-slate-100 to-slate-50 px-6 py-4">
          <h1 className="text-lg font-semibold text-black">Configure Connection Gate</h1>
        </div>
        <div className="p-6">
          <ConnectionForm savedValues={savedValues} />
        </div>
      </div>
    </main>
  );
}
```

`app/connection-form.tsx` (`"use client"`, the only interactive piece):

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectDatabaseAction } from "./connect-database-action";
import type { SavedConnectionValues } from "@/lib/connection-keychain";

function Field({
  id,
  label,
  required,
  ...inputProps
}: { id: string; label: string; required?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm text-black">
        {label} {required ? <span className="text-red-600">*</span> : null}{" "}
        <span className="text-black/40">{required ? "(Required)" : "(Optional)"}</span>
      </label>
      <Input id={id} name={id} {...inputProps} />
    </div>
  );
}

export function ConnectionForm({ savedValues }: { savedValues: SavedConnectionValues }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setConnecting(true);
    setError(null);
    const result = await connectDatabaseAction(formData);
    if (!result.ok) {
      setConnecting(false);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <Field
        id="databaseUrl"
        label="Database URL"
        required
        type="password"
        placeholder="e.g., postgresql://user:password@localhost:5432/mydatabase"
        defaultValue={savedValues.databaseUrl}
      />
      <Field
        id="storageBucket"
        label="Storage Bucket Name"
        placeholder="e.g., global-knowledge-assets"
        defaultValue={savedValues.storageBucket}
      />
      <Field
        id="storageAccessKeyId"
        label="Access Key ID"
        placeholder="e.g., AKIA1234567890EXAMPLE"
        defaultValue={savedValues.storageAccessKeyId}
      />
      <Field
        id="storageSecretAccessKey"
        label="Secret Access Key"
        type="password"
        placeholder="········"
        defaultValue={savedValues.storageSecretAccessKey}
      />
      <Field
        id="storageEndpoint"
        label="Storage Endpoint"
        placeholder="e.g., https://s3.us-east-1.amazonaws.com"
        defaultValue={savedValues.storageEndpoint}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
        <Button type="button" variant="outline" onClick={() => formRef.current?.reset()}>
          Clear
        </Button>
        <Button type="submit" disabled={connecting}>
          {connecting ? "Connecting…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
```

On successful connect, `router.refresh()` re-runs the layout's server-side
connection check on the same route the user was already on — no full page
reload, no restart.

### 3a. Local keychain storage

New requirement: everything submitted through this form is saved to the
OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret
Service), not just written in plaintext.

**What does *not* change:** Prisma (`lib/prisma.ts`), the MCP server
(`mcp/rag-manager/`, a separate Node process), and the seed script all keep
reading `DATABASE_URL`/storage vars from `process.env`/`.env`, exactly as
today. Making the keychain the *only* source of truth would mean teaching
every one of those independent consumers to query it instead — a much
larger change than this feature needs, and the MCP server in particular has
no relationship to this web form at all.

**What's new:** `.env` stays the operational source of truth; the same five
values are *additionally* mirrored into the OS keychain, purely so this form
can securely recall them the next time the gate is shown (`savedValues`,
threaded from the layout down through `ConnectionGate`/`ConnectionForm`),
instead of the user re-typing or hunting for them elsewhere. This works
identically whether the app is running in a plain browser (`npm run dev`) or
wrapped in Tauri — it's the Node server talking to the OS keychain directly,
not a Tauri-specific `invoke()` bridge, so there's no dual implementation to
maintain and no dependency on the Tauri wrapper being present.

Library: [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring)
(new dependency) — actively maintained, prebuilt native bindings for macOS/
Windows/Linux, no native toolchain needed at install time (unlike the older,
largely-abandoned `keytar`).

```ts
// lib/connection-keychain.ts
import { Entry } from "@napi-rs/keyring";

const SERVICE = "awesome-rag-forge";

const KEYS = [
  "databaseUrl",
  "storageBucket",
  "storageAccessKeyId",
  "storageSecretAccessKey",
  "storageEndpoint",
] as const;

export type SavedConnectionValues = Partial<Record<(typeof KEYS)[number], string>>;

export function saveConnectionValue(key: (typeof KEYS)[number], value: string) {
  new Entry(SERVICE, key).setPassword(value);
}

export function loadSavedConnectionValues(): SavedConnectionValues {
  const values: SavedConnectionValues = {};
  for (const key of KEYS) {
    try {
      values[key] = new Entry(SERVICE, key).getPassword();
    } catch {
      // No stored value for this key yet -- expected on first run, not an error.
    }
  }
  return values;
}
```

`connectDatabaseAction` (§2, revised below) calls `saveConnectionValue` for
each non-blank submitted field, alongside its existing `.env` write.
`app/layout.tsx` calls `loadSavedConnectionValues()` when disconnected and
passes the result into `ConnectionGate` as `savedValues`, so the form
pre-fills from the keychain rather than starting blank every time (a masked
field still shows its saved value as the browser's own password-manager-
style dots, not plaintext — `type="password"` already gives us that for
free via `defaultValue`).

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
          <ConnectionGate savedValues={loadSavedConnectionValues()} />
        )}
      </body>
    </html>
  );
}
```

`loadSavedConnectionValues()` (§3a) only ever runs on this disconnected
branch — no keychain read happens on every request once connected, only
when the gate is about to be shown.

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
- `lib/connection-keychain.test.ts` (new): `saveConnectionValue` +
  `loadSavedConnectionValues` round-trip against the real OS keychain (no
  mock — `@napi-rs/keyring` is a thin native binding, mocking it would only
  test the mock) using a distinct test-only service name so it never
  collides with or pollutes real saved values, cleaning up (`Entry.deletePassword()`)
  in the test's `afterEach`.
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
