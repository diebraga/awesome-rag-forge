"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Download, FileJson, PlugZap, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortableBrainStats } from "@/lib/portable-brain";
import { importBrainAction, type PortableBrainImportState } from "./actions";

const initialState: PortableBrainImportState = {
  ok: false,
  applied: false,
  message: "",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <div className="text-xs font-medium uppercase text-black/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-black">{value}</div>
    </div>
  );
}

function makeExportHref(includePending: boolean, includeFeedback: boolean) {
  const params = new URLSearchParams();
  if (includePending) params.set("includePending", "true");
  if (includeFeedback) params.set("includeFeedback", "true");
  const query = params.toString();
  return `/portable-brain/export${query ? `?${query}` : ""}`;
}

export function PortableBrainPageClient({ stats }: { stats: PortableBrainStats }) {
  const [mode, setMode] = useState<"export" | "import" | "connect">("export");
  const [includePending, setIncludePending] = useState(false);
  const [includeFeedback, setIncludeFeedback] = useState(false);
  const [snapshotJson, setSnapshotJson] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [state, formAction, pending] = useActionState(importBrainAction, initialState);

  const exportHref = makeExportHref(includePending, includeFeedback);
  const parsedPreview = useMemo(() => {
    if (!snapshotJson) return null;
    try {
      const parsed = JSON.parse(snapshotJson) as { data?: Record<string, unknown[]> };
      return {
        scopes: parsed.data?.knowledgeScopes?.length ?? 0,
        collections: parsed.data?.ragCollections?.length ?? 0,
        documents: parsed.data?.ragDocuments?.length ?? 0,
        chunks: parsed.data?.ragChunks?.length ?? 0,
      };
    } catch {
      return null;
    }
  }, [snapshotJson]);

  const prompt = `Set up Awesome RAG Forge as a portable brain in this project. Use Postgres with pgvector, run npm install, configure DATABASE_URL through the repo setup flow, run npx prisma db push, import the provided brain snapshot with npm run brain:import -- --file brain.json after a dry run, then run npm run rag:embeddings:backfill. Do not create foreign-key relationships from RAG tables to host-app user/account tables; use generic KnowledgeScope rows or metadata externalRef values.`;

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">Portable Brain</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black">Move this brain without the maze</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/70">
              Export, import, or connect this RAG brain to another Postgres project. The details are still here, but the happy path is buttons first.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" /> Database connected
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Scopes" value={stats.scopes} />
          <Stat label="Collections" value={stats.collections} />
          <Stat label="Documents" value={stats.documents} />
          <Stat label="Chunks" value={stats.chunks} />
          <Stat label="pgvector" value={stats.pgvectorInstalled ? "Ready" : "Missing"} />
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <button onClick={() => setMode("export")} className={`rounded-xl border p-4 text-left ${mode === "export" ? "border-blue-500 bg-blue-50" : "border-black/10 bg-white"}`}>
            <Download className="mb-3 size-5 text-blue-700" />
            <div className="font-semibold text-black">Export Brain</div>
            <p className="mt-1 text-sm text-black/60">Create a downloadable snapshot.</p>
          </button>
          <button onClick={() => setMode("import")} className={`rounded-xl border p-4 text-left ${mode === "import" ? "border-blue-500 bg-blue-50" : "border-black/10 bg-white"}`}>
            <UploadCloud className="mb-3 size-5 text-blue-700" />
            <div className="font-semibold text-black">Import Brain</div>
            <p className="mt-1 text-sm text-black/60">Dry-run a snapshot before applying it.</p>
          </button>
          <button onClick={() => setMode("connect")} className={`rounded-xl border p-4 text-left ${mode === "connect" ? "border-blue-500 bg-blue-50" : "border-black/10 bg-white"}`}>
            <PlugZap className="mb-3 size-5 text-blue-700" />
            <div className="font-semibold text-black">Connect Project</div>
            <p className="mt-1 text-sm text-black/60">Copy a setup prompt for another agent.</p>
          </button>
        </section>

        {mode === "export" && (
          <Card>
            <CardHeader>
              <CardTitle>Export Brain</CardTitle>
              <CardDescription>Download a JSON snapshot. Secrets and embeddings are not included.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-black/70">
                <input type="checkbox" checked={includePending} onChange={(event) => setIncludePending(event.target.checked)} />
                Include pending review rows
              </label>
              <label className="flex items-center gap-2 text-sm text-black/70">
                <input type="checkbox" checked={includeFeedback} onChange={(event) => setIncludeFeedback(event.target.checked)} />
                Include feedback and review history
              </label>
              <a
                href={exportHref}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-black px-2.5 text-sm font-medium text-white transition-colors hover:bg-black/80"
              >
                <Download className="size-4" /> Create Snapshot
              </a>
            </CardContent>
          </Card>
        )}

        {mode === "import" && (
          <Card>
            <CardHeader>
              <CardTitle>Import Brain</CardTitle>
              <CardDescription>Choose a snapshot, dry-run it, then apply only when the summary looks right.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/20 bg-white p-6 text-center text-sm text-black/60">
                <FileJson className="mb-2 size-6 text-blue-700" />
                Drop or choose a portable brain JSON file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      JSON.parse(text);
                      setSnapshotJson(text);
                      setSnapshotError("");
                    } catch {
                      setSnapshotJson("");
                      setSnapshotError("That file is not valid JSON.");
                    }
                  }}
                />
              </label>
              {snapshotError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{snapshotError}</p>}
              {parsedPreview && (
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Scopes" value={parsedPreview.scopes} />
                  <Stat label="Collections" value={parsedPreview.collections} />
                  <Stat label="Documents" value={parsedPreview.documents} />
                  <Stat label="Chunks" value={parsedPreview.chunks} />
                </div>
              )}
              <form action={formAction} className="flex flex-wrap gap-3">
                <input type="hidden" name="snapshotJson" value={snapshotJson} />
                <Button type="submit" disabled={!snapshotJson || pending}>Dry Run Import</Button>
                <Button type="submit" name="apply" value="true" disabled={!snapshotJson || pending} variant="secondary">
                  Apply Import
                </Button>
              </form>
              {state.message && (
                <pre className={`max-h-72 overflow-auto rounded-md border p-3 text-xs ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-900"}`}>
                  {state.message}{state.dryRun ? `\n\n${JSON.stringify(state.dryRun, null, 2)}` : ""}
                </pre>
              )}
            </CardContent>
          </Card>
        )}

        {mode === "connect" && (
          <Card>
            <CardHeader>
              <CardTitle>Connect To Another Project</CardTitle>
              <CardDescription>Copy this into the agent working in the target project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea readOnly value={prompt} className="min-h-40 w-full rounded-lg border border-black/10 bg-white p-3 text-sm text-black/80" />
              <Button type="button" onClick={() => navigator.clipboard.writeText(prompt)}>Copy Prompt</Button>
            </CardContent>
          </Card>
        )}

        <details className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
          <summary className="cursor-pointer font-semibold text-black">Advanced details</summary>
          <div className="mt-3 space-y-2">
            <p>Brain tables: {stats.installedTables.length} installed, {stats.missingTables.length} missing.</p>
            <p className="break-words text-xs text-black/50">{stats.postgresVersion}</p>
          </div>
        </details>
      </div>
    </main>
  );
}
