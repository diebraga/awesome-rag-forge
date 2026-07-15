# Connection Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block every route behind a single connection-gate card (matching the approved mockup) until a live database connection exists, remembering submitted values in the OS keychain, and delete the `/review` page entirely in favor of a Header "Disconnect" testing control.

**Architecture:** One new keychain-backed storage module, a Proxy-wrapped Prisma client that can reconnect without a restart, one server action, two new UI files (gate + form), a single gating check moved into `app/layout.tsx`, and deletion of now-redundant per-page checks plus the `/review` route.

**Tech Stack:** Next.js App Router (server components, server actions), `@napi-rs/keyring` (new dependency), Vitest.

## Global Constraints

- `.env` stays the operational source of truth for Prisma/MCP server/seed script — nothing about how those read `DATABASE_URL`/storage vars changes (spec Design §3a).
- Keychain writes are additive, mirrored alongside `.env` writes, never replacing them (spec Design §3a).
- `npm run setup` (masked terminal input) stays available as a plain CLI script — only its in-UI pointer is removed (spec Design §3).
- The MCP-server-side review/approval workflow (`RagReview`, `mcp/rag-manager/review-policy.ts`) is untouched — only the `/review` web page is deleted (spec Non-goals).
- `lib/local-review-guard.ts` stays — still used by `app/collections/actions.ts` (spec Design §6).
- **Do not `git push`, open a PR, or merge anything in this plan.** Commit locally as each task completes (matching this project's existing per-task commit habit), but stop there — the user wants to review the running app first.

---

### Task 1: `lib/connection-keychain.ts` — OS keychain storage

**Files:**
- Modify: `package.json` (add `@napi-rs/keyring`)
- Create: `lib/connection-keychain.ts`
- Test: `lib/connection-keychain.test.ts`

**Interfaces:**
- Produces: `SavedConnectionValues` (type), `saveConnectionValue(key, value)`, `loadSavedConnectionValues(): SavedConnectionValues` — consumed by Task 3 (action) and Task 4 (UI)/Task 5 (layout).

- [ ] **Step 1: Install the dependency**

Run: `npm install @napi-rs/keyring`
Expected: `package.json`/`package-lock.json` updated, install succeeds (prebuilt native binding, no compiler needed).

- [ ] **Step 2: Write the failing test**

```ts
// lib/connection-keychain.test.ts
import { afterEach, describe, expect, test } from "vitest";
import { Entry } from "@napi-rs/keyring";
import { loadSavedConnectionValues, saveConnectionValue } from "./connection-keychain";

const KEYS = ["databaseUrl", "storageBucket", "storageAccessKeyId", "storageSecretAccessKey", "storageEndpoint"] as const;

afterEach(() => {
  for (const key of KEYS) {
    try {
      new Entry("awesome-rag-forge", key).deletePassword();
    } catch {
      // Nothing saved for this key -- fine, that's what we're cleaning up toward.
    }
  }
});

describe("connection keychain", () => {
  test("round-trips a saved value", () => {
    saveConnectionValue("databaseUrl", "postgresql://user:pass@localhost:5432/db");
    const values = loadSavedConnectionValues();
    expect(values.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
  });

  test("keys with no saved value are simply absent, not an error", () => {
    const values = loadSavedConnectionValues();
    expect(values.storageBucket).toBeUndefined();
  });

  test("saving one key does not affect the others", () => {
    saveConnectionValue("storageBucket", "my-bucket");
    const values = loadSavedConnectionValues();
    expect(values.storageBucket).toBe("my-bucket");
    expect(values.databaseUrl).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/connection-keychain.test.ts`
Expected: FAIL — `Cannot find module './connection-keychain'`.

- [ ] **Step 4: Write the implementation**

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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/connection-keychain.test.ts`
Expected: PASS (3 tests). This talks to your real OS keychain — macOS will only prompt for Keychain access the first time, if at all, for a new service name.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/connection-keychain.ts lib/connection-keychain.test.ts
git commit -m "feat: add OS-keychain-backed connection value storage

Additive alongside .env, not a replacement -- Prisma/MCP/seed keep
reading .env unchanged. This exists purely so the connection gate form
can recall previously-entered values."
```

---

### Task 2: `lib/prisma.ts` — reconnect without a restart

**Files:**
- Modify: `lib/prisma.ts`
- Test: `lib/prisma.test.ts`

**Interfaces:**
- Consumes: `getDatabaseUrl` from `@/lib/database-config` (existing, unchanged).
- Produces: `prisma` (same export name/shape as before — a `PrismaClient`-compatible object) — every existing consumer (`app/review`-adjacent deletions aside, all API routes, seed script, etc.) is unaffected.

- [ ] **Step 1: Write the failing test**

```ts
// lib/prisma.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockGetDatabaseUrl = vi.fn();
vi.mock("@/lib/database-config", () => ({ getDatabaseUrl: mockGetDatabaseUrl }));

const mockPrismaClientCtor = vi.fn().mockImplementation(() => ({
  $disconnect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: mockPrismaClientCtor }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));

beforeEach(() => {
  mockPrismaClientCtor.mockClear();
  // @ts-expect-error -- test-only reset of module-scoped globalThis cache
  globalThis.prismaClient = undefined;
  // @ts-expect-error
  globalThis.prismaClientUrl = undefined;
});

describe("prisma proxy", () => {
  test("builds a client lazily on first property access, not at import time", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    expect(mockPrismaClientCtor).not.toHaveBeenCalled();
    const { prisma } = await import("./prisma");
    void prisma.$disconnect; // trigger the Proxy's get trap
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(1);
  });

  test("reuses the same client when the URL is unchanged", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    const { prisma } = await import("./prisma");
    void prisma.$disconnect;
    void prisma.$disconnect;
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(1);
  });

  test("rebuilds when the URL changes between accesses", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    const { prisma } = await import("./prisma");
    void prisma.$disconnect;
    mockGetDatabaseUrl.mockReturnValue("postgresql://b/db2");
    void prisma.$disconnect;
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/prisma.test.ts`
Expected: FAIL — current `lib/prisma.ts` builds the client once at module load (not lazily), so the first assertion (`not.toHaveBeenCalled()` before any property access) fails.

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/prisma.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions in existing Prisma consumers**

Run: `npm test`
Expected: all existing tests still pass — every other file's `import { prisma } from "@/lib/prisma"` continues to work identically since the exported shape/name didn't change.

- [ ] **Step 6: Commit**

```bash
git add lib/prisma.ts lib/prisma.test.ts
git commit -m "feat: make prisma client reconnect without a server restart

Wraps the client in a Proxy that rebuilds itself if DATABASE_URL has
changed since the last build, instead of freezing the connection at
module-load time. Zero call-site changes for existing consumers."
```

---

### Task 3: `app/connect-database-action.ts` — the submit action

**Files:**
- Create: `app/connect-database-action.ts`

**Interfaces:**
- Consumes: `upsertEnvVar` from `@/scripts/env-file` (existing), `canSimulateDisconnect` from `@/lib/dev-disconnect` (existing), `saveConnectionValue` + `SavedConnectionValues` from `@/lib/connection-keychain` (Task 1).
- Produces: `connectDatabaseAction(formData): Promise<ConnectResult>`, `ConnectResult` type — consumed by Task 4.

- [ ] **Step 1: Write the action**

```ts
// app/connect-database-action.ts
"use server";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { upsertEnvVar } from "@/scripts/env-file";
import { canSimulateDisconnect } from "@/lib/dev-disconnect";
import { saveConnectionValue, type SavedConnectionValues } from "@/lib/connection-keychain";

export type ConnectResult = { ok: true } | { ok: false; error: string };

const OPTIONAL_FIELDS: Array<{ formKey: keyof SavedConnectionValues; envKey: string }> = [
  { formKey: "storageBucket", envKey: "STORAGE_BUCKET" },
  { formKey: "storageAccessKeyId", envKey: "STORAGE_ACCESS_KEY_ID" },
  { formKey: "storageSecretAccessKey", envKey: "STORAGE_SECRET_ACCESS_KEY" },
  { formKey: "storageEndpoint", envKey: "STORAGE_ENDPOINT" },
];

export async function connectDatabaseAction(formData: FormData): Promise<ConnectResult> {
  if (!canSimulateDisconnect()) {
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/connect-database-action.ts
git commit -m "feat: add connectDatabaseAction server action

One action for all five gate fields -- only databaseUrl is required.
Writes to .env (operational) and mirrors non-blank values into the
keychain (Task 1). Never echoes any submitted value back in its result."
```

---

### Task 4: Gate UI — `app/connection-gate.tsx` + `app/connection-form.tsx`

**Files:**
- Create: `app/connection-gate.tsx`
- Create: `app/connection-form.tsx`

**Interfaces:**
- Consumes: `connectDatabaseAction` (Task 3), `SavedConnectionValues` (Task 1), `Button`/`Input` from `@/components/ui/*` (existing).
- Produces: `ConnectionGate({ savedValues })` — consumed by Task 5 (layout).

- [ ] **Step 1: Write `app/connection-form.tsx`**

```tsx
// app/connection-form.tsx
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
  defaultValue,
  ...inputProps
}: { id: string; label: string; required?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm text-black">
        {label} {required ? <span className="text-red-600">*</span> : null}{" "}
        <span className="text-black/40">{required ? "(Required)" : "(Optional)"}</span>
      </label>
      <Input id={id} name={id} defaultValue={defaultValue} {...inputProps} />
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

- [ ] **Step 2: Write `app/connection-gate.tsx`**

```tsx
// app/connection-gate.tsx
import { ConnectionForm } from "./connection-form";
import type { SavedConnectionValues } from "@/lib/connection-keychain";

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

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (Task 5 hasn't wired this in yet, but the files must stand alone type-clean).

- [ ] **Step 4: Commit**

```bash
git add app/connection-gate.tsx app/connection-form.tsx
git commit -m "feat: add connection gate UI matching approved mockup

Single card, five fields (Database URL required, four storage fields
optional), Clear/Continue footer buttons. Not wired into the app yet --
that's Task 5."
```

---

### Task 5: Wire the gate into `app/layout.tsx`

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getDatabaseConnectionStatus` (existing), `loadSavedConnectionValues` (Task 1), `ConnectionGate` (Task 4).

- [ ] **Step 1: Read the current file for exact context**

Run: `cat app/layout.tsx`
Expected output (current state, for reference while editing):

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Header } from "@/components/header";
import { PROJECT_NAME } from "@/lib/project";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isDatabaseConfigured } from "@/lib/database-config";
import { isDeveloperMode } from "@/lib/developer-mode";
import { TestingApiAuthPrompt } from "./testing-api-auth-prompt";
import { DeveloperModeBanner } from "./developer-mode-banner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "Chat UI for a conversational, MCP-managed RAG knowledge base.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const testingSurfaceEnabled = isDatabaseConfigured() && isTestingSurfaceEnabled();
  const developerMode = isDeveloperMode();

  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col overflow-hidden bg-white">
        <Header testingSurfaceEnabled={testingSurfaceEnabled} />
        {developerMode && <DeveloperModeBanner />}
        {testingSurfaceEnabled && <TestingApiAuthPrompt />}
        <div className="relative z-0 min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace the whole file**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Header } from "@/components/header";
import { PROJECT_NAME } from "@/lib/project";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isDeveloperMode } from "@/lib/developer-mode";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { loadSavedConnectionValues } from "@/lib/connection-keychain";
import { TestingApiAuthPrompt } from "./testing-api-auth-prompt";
import { DeveloperModeBanner } from "./developer-mode-banner";
import { ConnectionGate } from "./connection-gate";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "Chat UI for a conversational, MCP-managed RAG knowledge base.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const database = await getDatabaseConnectionStatus();
  const testingSurfaceEnabled = database.ok && isTestingSurfaceEnabled();
  const developerMode = isDeveloperMode();

  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col overflow-hidden bg-white">
        {database.ok ? (
          <>
            <Header testingSurfaceEnabled={testingSurfaceEnabled} />
            {developerMode && <DeveloperModeBanner />}
            {testingSurfaceEnabled && <TestingApiAuthPrompt />}
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

Note: `export const dynamic = "force-dynamic"` moves here from the individual
pages (Task 6 removes it from six of them along with their connection
checks) — the layout is now what needs fresh-per-request rendering, since
it's the thing deciding gate-vs-app on every request.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed. (Individual pages still import `getDatabaseConnectionStatus`/old screens at this point in the plan — that's fine, they're only cleaned up in Task 6; nothing here breaks them.)

- [ ] **Step 4: Manual verification**

Run: `DATABASE_URL= npm run dev`, open `http://localhost:3000`.
Expected: the "Configure Connection Gate" card renders, no `Header`, no nav — matches the approved mockup.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: gate the entire app behind the connection card

app/layout.tsx is now the single source of truth: renders Header +
page content only when database.ok, otherwise only the connection
gate. No route can render any content without a live connection."
```

---

### Task 6: Remove redundant per-page checks and dead code

**Files:**
- Modify: `app/page.tsx`, `app/portable-brain/page.tsx`, `app/harness/page.tsx`, `app/api-docs/page.tsx`, `app/collections/page.tsx`, `app/collections/[collectionId]/page.tsx`
- Delete: `app/database-setup-required.tsx`, `app/database-connection-failed.tsx`, `app/setup-actions.tsx`, `lib/setup-terminal.ts`, `lib/setup-terminal.test.ts`, `app/api/setup/open-terminal/route.ts`, `lib/mask-database-url.ts`, `lib/mask-database-url.test.ts`

**Interfaces:** None — this task only removes code, nothing new is produced or consumed.

- [ ] **Step 1: Remove the connection check from `app/page.tsx`**

Replace:
```tsx
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { DatabaseConnectionFailed } from "./database-connection-failed";
import { DatabaseSetupRequired } from "./database-setup-required";
import { TestingSurfaceDisabled } from "./testing-surface-disabled";
import { TestingApiAuthRequired } from "./testing-api-auth-required";

export const dynamic = "force-dynamic";

export default async function Home() {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return database.reason === "missing" ? (
      <DatabaseSetupRequired />
    ) : (
      <DatabaseConnectionFailed maskedUrl={database.maskedUrl} />
    );
  }

  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }
```
with:
```tsx
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { TestingSurfaceDisabled } from "./testing-surface-disabled";
import { TestingApiAuthRequired } from "./testing-api-auth-required";

export default async function Home() {
  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }
```
(the rest of the file — the `isPublicDeploymentRuntime`/`TestingApiAuthRequired` branch and the `ChatPageClient` import/return — is unchanged; `export const dynamic` moved to the layout in Task 5, so it's removed here, not duplicated).

- [ ] **Step 2: Remove the connection check from `app/portable-brain/page.tsx`**

Replace:
```tsx
import { DatabaseConnectionFailed } from "@/app/database-connection-failed";
import { DatabaseSetupRequired } from "@/app/database-setup-required";
import { TestingApiAuthRequired } from "@/app/testing-api-auth-required";
import { TestingSurfaceDisabled } from "@/app/testing-surface-disabled";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { getPortableBrainStats } from "@/lib/portable-brain";
import { prisma } from "@/lib/prisma";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { PortableBrainPageClient } from "./portable-brain-page-client";

export const dynamic = "force-dynamic";

export default async function PortableBrainPage() {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return database.reason === "missing" ? <DatabaseSetupRequired /> : <DatabaseConnectionFailed />;
  }

```
with:
```tsx
import { TestingApiAuthRequired } from "@/app/testing-api-auth-required";
import { TestingSurfaceDisabled } from "@/app/testing-surface-disabled";
import { getPortableBrainStats } from "@/lib/portable-brain";
import { prisma } from "@/lib/prisma";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { PortableBrainPageClient } from "./portable-brain-page-client";

export default async function PortableBrainPage() {

```
(keep everything below unchanged — the rest of the function body is untouched, only the import block, `export const dynamic` line, and the connection-check block are removed).

- [ ] **Step 3: Remove the connection check from `app/harness/page.tsx`, `app/api-docs/page.tsx`, `app/collections/page.tsx`, and `app/collections/[collectionId]/page.tsx`**

Each of these four files has the identical pattern (verified in the spec's investigation — `database` is never referenced past the check in any of them). In each file:

1. Remove the import lines for `getDatabaseConnectionStatus`, `DatabaseConnectionFailed`, and `DatabaseSetupRequired`.
2. Remove `export const dynamic = "force-dynamic";`.
3. Remove the block:
   ```tsx
   const database = await getDatabaseConnectionStatus();

   if (!database.ok) {
     return database.reason === "missing" ? <DatabaseSetupRequired /> : <DatabaseConnectionFailed />;
   }

   ```
   from the top of each page's default-exported function body.

Everything else in each file (the rest of the imports, the rest of the function) stays exactly as-is.

- [ ] **Step 4: Delete the now-unused files**

```bash
rm app/database-setup-required.tsx
rm app/database-connection-failed.tsx
rm app/setup-actions.tsx
rm lib/setup-terminal.ts lib/setup-terminal.test.ts
rm app/api/setup/open-terminal/route.ts
rm lib/mask-database-url.ts lib/mask-database-url.test.ts
```

- [ ] **Step 5: Remove the now-dead `maskedUrl`/simulated-disconnect-error plumbing from `lib/database-health.ts`**

Replace the whole file with:

```ts
// lib/database-health.ts
import { prisma } from "@/lib/prisma";
import { DATABASE_SETUP_ERROR, isDatabaseConfigured } from "@/lib/database-config";
import { isDevDisconnectSimulated } from "@/lib/dev-disconnect";

export const DATABASE_CONNECTION_ERROR =
  "Unable to connect to the configured database. Check DATABASE_URL, network access, credentials, SSL settings, and whether the Postgres server is running.";

export const DATABASE_SIMULATED_DISCONNECT_ERROR =
  "Simulated disconnect is on. Use the Disconnect button in the header to turn it off.";

export type DatabaseConnectionStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "connection"; error: string };

export async function getDatabaseConnectionStatus(): Promise<DatabaseConnectionStatus> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "missing", error: DATABASE_SETUP_ERROR };
  }

  if (isDevDisconnectSimulated()) {
    return { ok: false, reason: "connection", error: DATABASE_SIMULATED_DISCONNECT_ERROR };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, reason: "connection", error: DATABASE_CONNECTION_ERROR };
  }
}
```

(Wording of `DATABASE_SIMULATED_DISCONNECT_ERROR` updated since it no longer points at `/review`, which Task 7 deletes — pointing at the Header instead.)

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors and no unused-import warnings.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all pass (the deleted `lib/setup-terminal.test.ts` and `lib/mask-database-url.test.ts` are gone, not failing).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove redundant per-page connection checks and dead code

app/layout.tsx (Task 5) is now the single source of truth. Deletes the
old two-screen error UI, the terminal-opening feature it depended on,
and the now-unused maskedUrl plumbing -- none of it is reachable
anymore now that the gate replaces the whole page when disconnected."
```

---

### Task 7: Delete `/review`, move Disconnect to the Header

**Files:**
- Delete: `app/review/page.tsx`, `app/review/actions.ts`, `app/review/dev-disconnect-toggle.tsx`
- Modify: `components/header.tsx`

**Interfaces:**
- Consumes: `/api/dev/toggle-disconnect` (existing, unchanged route).

- [ ] **Step 1: Confirm nothing outside `app/review/` imports its actions (re-verify before deleting)**

Run: `grep -rln "approveChunkAction\|rejectChunkAction\|approveHarnessRuleAction\|rejectHarnessRuleAction" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: only `app/review/actions.ts` and `app/review/page.tsx` — confirms safe to delete both together (already verified during spec-writing; re-run here in case anything changed).

- [ ] **Step 2: Delete the review directory**

```bash
rm -rf app/review
```

- [ ] **Step 3: Add the Disconnect control to `components/header.tsx`**

Replace the whole file:

```tsx
// components/header.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { MenuIcon, WifiOff } from "lucide-react";
import { PROJECT_NAME } from "@/lib/project";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from "@/components/ui/menu";

const NAV_LINKS = [
  { href: "/", label: "Chat" },
  { href: "/collections", label: "Collections" },
  { href: "/harness", label: "Harness" },
  { href: "/schema", label: "Schema" },
  { href: "/portable-brain", label: "Portable" },
  { href: "/api-docs", label: "API Docs" },
];

export function Header({ testingSurfaceEnabled }: { testingSurfaceEnabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const links = testingSurfaceEnabled ? NAV_LINKS : [];

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/dev/toggle-disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-white px-4">
      <span className="text-sm font-semibold tracking-tight text-black">{PROJECT_NAME}</span>

      <div className="flex items-center gap-4">
        {links.length > 0 && (
          <>
            <nav className="hidden items-center gap-5 sm:flex">
              {links.map((link) => {
                const isActive =
                  link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={
                      isActive
                        ? "text-sm font-medium text-blue-600"
                        : "text-sm font-medium text-black/60 hover:text-black"
                    }
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <Menu>
              <MenuTrigger aria-label="Open navigation menu" className="sm:hidden">
                <MenuIcon className="size-5" />
              </MenuTrigger>
              <MenuContent className="sm:hidden">
                {links.map((link) => {
                  const isActive =
                    link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                  return (
                    <MenuLinkItem
                      key={link.href}
                      render={<Link href={link.href} />}
                      className={isActive ? "text-blue-600 data-[highlighted]:text-blue-600" : undefined}
                    >
                      {link.label}
                    </MenuLinkItem>
                  );
                })}
              </MenuContent>
            </Menu>
          </>
        )}

        <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm">
          <WifiOff className="size-4" />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed. Build output no longer lists a `/review` route.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, connect via the gate (Task 5 already verified this renders), confirm the Header now shows a "Disconnect" button. Click it, confirm the app falls back to the connection gate immediately. Navigate to `http://localhost:3000/review` directly, confirm it 404s.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete /review, move Disconnect control to the header

/review (page, actions, and its dev-disconnect-toggle) is deleted --
confirmed no other file imports its server actions. The MCP-side
review/approval workflow is untouched, only this secondary local web
page goes. lib/local-review-guard.ts stays: still used by
app/collections/actions.ts for its unrelated archive action."
```

---

### Task 8: Documentation cleanup

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/database.md`, `docs/overview.md`, `docs/mcp-server.md`, `docs/testing-surface.md`, `docs/security.md`, `app/api/rag/harness/route.ts` (swagger comment only), `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`

**Interfaces:** None — documentation only.

- [ ] **Step 1: `docs/architecture.md`**

Replace:
```
This project keeps normal use and knowledge management separate. The default path is read-only chat/API, while knowledge creation and broad management belong to the MCP server. Narrow local-only browser exceptions exist for `/review` approvals and Collections archiving of already-approved visible knowledge.
```
with:
```
This project keeps normal use and knowledge management separate. The default path is read-only chat/API, while knowledge creation and broad management belong to the MCP server. A narrow local-only browser exception exists for Collections archiving of already-approved visible knowledge.
```

Replace:
```
| Role | Read-only RAG viewer, plus local-only review dashboard | Exclusive knowledge & harness manager |
```
with:
```
| Role | Read-only RAG viewer | Exclusive knowledge & harness manager |
```

Replace:
```
Deliberately excluded from the chat, collections browsing, and harness end-user surfaces: `RagReview` (approval/rejection audit trail), `RagFeedback` (user-submitted ratings/comments that were never reviewed for display), and `RagEvalCase` (testing artifacts). Those are creator/operational concerns. The local-only `/review` page may show pending chunks and pending harness rules for approval, but it must stay outside the public/API surface and keep the production guard.
```
with:
```
Deliberately excluded from the chat, collections browsing, and harness end-user surfaces: `RagReview` (approval/rejection audit trail), `RagFeedback` (user-submitted ratings/comments that were never reviewed for display), and `RagEvalCase` (testing artifacts). Those are creator/operational concerns, managed exclusively through the MCP server.
```

- [ ] **Step 2: `docs/database.md`**

Replace:
```
| `HarnessRule` | A capability or restriction statement (`kind: CAPABILITY \| RESTRICTION`) describing what the chat can/cannot do, with the same review states as knowledge. **Not knowledge content** — only `APPROVED` rows are read into the system prompt; proposed through the MCP server and finally approved/rejected through MCP or the local-only `/review` page. |
```
with:
```
| `HarnessRule` | A capability or restriction statement (`kind: CAPABILITY \| RESTRICTION`) describing what the chat can/cannot do, with the same review states as knowledge. **Not knowledge content** — only `APPROVED` rows are read into the system prompt; proposed and approved/rejected through the MCP server. |
```

- [ ] **Step 3: `docs/overview.md`**

Replace:
```
- **Chat application (`app/`)** — a viewer for testing `APPROVED` knowledge, plus local-only review and collection-maintenance actions. Chat/harness/API surfaces stay read-only; `/review` and Collections archive actions are guarded separately and are not public admin panels.
```
with:
```
- **Chat application (`app/`)** — a viewer for testing `APPROVED` knowledge, plus a local-only collection-maintenance action. Chat/harness/API surfaces stay read-only; the Collections archive action is guarded separately and is not a public admin panel.
```

- [ ] **Step 4: `docs/mcp-server.md`**

Replace:
```
The MCP server lives at `mcp/rag-manager/` and manages the RAG knowledge base through Prisma. It is the supported path for creating, organizing, correcting, archiving, and ingesting knowledge/harness changes. The Next.js chat app only reads approved external chat-visible chunks; the separate local-only `/review` page can approve/reject pending chunks and harness rules directly from the database. See [System Architecture](architecture.md) for the full read/write boundary.
```
with:
```
The MCP server lives at `mcp/rag-manager/` and manages the RAG knowledge base through Prisma. It is the supported path for creating, organizing, correcting, archiving, ingesting, and approving/rejecting knowledge/harness changes. The Next.js chat app only reads approved external chat-visible chunks. See [System Architecture](architecture.md) for the full read/write boundary.
```

- [ ] **Step 5: `docs/testing-surface.md`**

Remove the line:
```
- `GET /review` — local-only pending chunk/harness-rule review dashboard; additionally refuses production/public runtimes.
```

- [ ] **Step 6: `docs/security.md`**

Replace:
```
This applies identically to the HTTP transport (`npm run mcp:rag-manager:http`, see [MCP Server](mcp-server.md#http-transport-for-non-stdio-mcp-clients)) — same server, same full read/write access, just reachable over HTTP instead of stdio for trusted clients that need it. It's bound to `127.0.0.1` by default for the same reason `canAutoStartOllama()` is local-only in `lib/ollama.ts`: no accidental network exposure. The local `/review` dashboard does not use this transport.
```
with:
```
This applies identically to the HTTP transport (`npm run mcp:rag-manager:http`, see [MCP Server](mcp-server.md#http-transport-for-non-stdio-mcp-clients)) — same server, same full read/write access, just reachable over HTTP instead of stdio for trusted clients that need it. It's bound to `127.0.0.1` by default for the same reason `canAutoStartOllama()` is local-only in `lib/ollama.ts`: no accidental network exposure.
```

Remove the line (a standalone bullet elsewhere in the same file):
```
- The Review page (`app/review/`) is the explicit local-only exception. It is for the builder reviewing pending chunks and harness rules on their own machine, reads directly from Postgres, and can approve/reject via server actions. Those actions must stay guarded by `assertLocalReviewMode()` and must never be exposed through public API routes or Swagger.
```

- [ ] **Step 7: `app/api/rag/harness/route.ts` (swagger doc-comment only)**

Replace:
```
 *     description: Read-only testing-surface endpoint for showing the approved assistant identity, capabilities, and restrictions. Harness proposal and management stay outside this API; pending review is handled through MCP or the guarded local /review page.
```
with:
```
 *     description: Read-only testing-surface endpoint for showing the approved assistant identity, capabilities, and restrictions. Harness proposal and management stay outside this API; pending review is handled through MCP.
```

- [ ] **Step 8: `README.md`**

Replace:
```
The local testing UI includes `/review`, a human-friendly review queue for pending chunks and harness rules. This page is deliberately local-only: it reads pending rows directly from the configured Postgres database and uses server actions for approve/reject decisions, guarded by `ENABLE_TESTING_SURFACE=true` and a non-production runtime check (`lib/local-review-guard.ts`). It is not an MCP client, does not require `MCP_AUTH_TOKEN`, and must not be exposed as a hosted admin panel. Collections uses the same local-only guard for its explicit archive action; chat, harness, and HTTP API routes remain approved-data/read-only.
```
with:
```
Pending chunks and harness rules are approved or rejected exclusively through the MCP server (`propose_source_insert` → human approval → `approve_chunk`). Collections uses a local-only guard (`lib/local-review-guard.ts`) for its own, separate explicit archive action; chat, harness, and HTTP API routes remain approved-data/read-only.
```

- [ ] **Step 9: `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`**

Each of these six files contains this identical bullet (already located during spec-writing):
```
- Never add a write path (create, edit, approve, reject, archive, delete) to the normal chat/API surface beyond two explicit exceptions: `POST /api/feedback`, which can only create `RagFeedback`, and the local-only `/review` dashboard, which can approve/reject pending `RagChunk` and `HarnessRule` rows through guarded server actions. `/review` must call `assertLocalReviewMode()`, must not become a public API, must not be documented in Swagger, and must refuse production/public runtimes. Everything else in the chat app reads `APPROVED`, `EXTERNAL`, `CHAT`-visible data only — see [docs/architecture.md](docs/architecture.md).
```
Replace it, in all six files, with:
```
- Never add a write path (create, edit, approve, reject, archive, delete) to the normal chat/API surface beyond the one explicit exception: `POST /api/feedback`, which can only create `RagFeedback`. Everything else in the chat app reads `APPROVED`, `EXTERNAL`, `CHAT`-visible data only — see [docs/architecture.md](docs/architecture.md). Pending-chunk/harness-rule approval is MCP-only, with no local-UI exception.
```

Also remove the now-nonexistent Setup UX doc's `/review`-adjacent framing if
present in the "Documentation index" list added by the prior spec — check
with `grep -n "review" CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules`
after the replacement above and confirm no remaining `/review`-page mentions
(the general MCP "review" workflow term appearing elsewhere in these files
is expected and correct — only literal `/review`-page references are in
scope here).

- [ ] **Step 10: Verify no stray `/review`-page references remain**

Run: `grep -rn "local-only \`/review\`\|/review\` dashboard\|/review\` page\|GET /review\|app/review/" README.md docs/*.md CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules app/api/rag/harness/route.ts`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add README.md docs/architecture.md docs/database.md docs/overview.md docs/mcp-server.md docs/testing-surface.md docs/security.md app/api/rag/harness/route.ts CLAUDE.md GEMINI.md CODEX.md .cursorrules .windsurfrules .clinerules
git commit -m "docs: remove /review page references now that it's deleted

The MCP-side review/approval workflow itself is unchanged and still
documented everywhere it was before -- only the deleted web page's
mentions are removed."
```

---

### Task 9: Final local verification (no push)

**Files:** none — verification only.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including the three new/changed test files from Tasks 1–2.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: succeeds. Route list no longer includes `/review` or `/api/setup/open-terminal`.

- [ ] **Step 3: Full manual walkthrough**

Run: `DATABASE_URL= npm run dev`, open `http://localhost:3000`.
1. Confirm the "Configure Connection Gate" card renders exactly like the approved mockup — header bar, five labeled fields (one required, four optional), Clear/Continue buttons — and nothing else (no Header, no nav).
2. Fill in a real `DATABASE_URL`, click Continue. Confirm the app becomes usable without restarting the dev server.
3. Reload the page (or navigate to `/collections`, `/harness`, etc.). Confirm the saved fields — check by disconnecting and reopening the gate — are pre-filled from the keychain, not blank.
4. Click "Disconnect" in the Header. Confirm every route falls back to the gate immediately, with no Header visible.
5. Navigate directly to `http://localhost:3000/review`. Confirm it 404s.

- [ ] **Step 4: Relaunch the Tauri desktop wrapper for a final visual check**

Run: `npx tauri dev`
Expected: native window opens, shows the same gate-first behavior as the browser.

- [ ] **Step 5: Report status — explicitly stop here**

Do not run `git push`, do not open a PR, do not merge. Summarize what was
verified and wait for explicit direction before touching the remote in any
way — this was a stated requirement for this plan.
