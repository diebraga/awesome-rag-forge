import Link from "next/link";
import { ChevronLeft, ChevronRight, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { AudienceBadge, ScopeBadge, VisibilityBadges } from "@/components/knowledge-boundary-badges";
import { Button } from "@/components/ui/button";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { getLocalReviewModeFailure } from "@/lib/local-review-guard";
import { prisma } from "@/lib/prisma";
import { DatabaseConnectionFailed } from "../database-connection-failed";
import { DatabaseSetupRequired } from "../database-setup-required";
import { DevDisconnectToggle } from "./dev-disconnect-toggle";
import {
  approveChunkAction,
  approveHarnessRuleAction,
  rejectChunkAction,
  rejectHarnessRuleAction,
} from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;

type ReviewTriage = {
  disposition?: string;
  confidence?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  summary?: string;
  recommendedAction?: string;
  reasons?: string[];
};

type ReviewReason = {
  title?: string;
  summary?: string;
  recommendedAction?: string;
  reasons?: string[];
};

type SearchParams = Promise<{ chunkPage?: string; harnessPage?: string }>;

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
}

function triageFrom(metadata: unknown): ReviewTriage {
  const triage = metadataRecord(metadata).reviewTriage;
  return triage && typeof triage === "object" && !Array.isArray(triage)
    ? (triage as ReviewTriage)
    : { disposition: "NEEDS_REVIEW", priority: "MEDIUM", summary: "No triage metadata was stored for this item." };
}

function reviewReasonFrom(metadata: unknown, triage: ReviewTriage): ReviewReason {
  const reason = metadataRecord(metadata).reviewReason;
  if (reason && typeof reason === "object" && !Array.isArray(reason)) return reason as ReviewReason;
  return {
    title: triage.disposition === "CONFLICTS_WITH_APPROVED"
      ? "Possible conflict"
      : triage.disposition === "DUPLICATE_OR_UPDATE_CANDIDATE"
        ? "Possible duplicate or update"
        : "Needs human review",
    summary: triage.summary,
    recommendedAction: triage.recommendedAction,
    reasons: triage.reasons,
  };
}

function priorityClass(priority?: string) {
  if (priority === "HIGH") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "LOW") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function pageHref(chunkPage: number, harnessPage: number) {
  return `/review?chunkPage=${chunkPage}&harnessPage=${harnessPage}`;
}

async function loadReviewData(requestedChunkPage: number, requestedHarnessPage: number) {
  const [chunkTotal, harnessTotal, triageChunks] = await Promise.all([
    prisma.ragChunk.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.harnessRule.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.ragChunk.findMany({
      where: { status: "PENDING_REVIEW" },
      select: { metadata: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const chunkPages = pageCount(chunkTotal);
  const harnessPages = pageCount(harnessTotal);
  const chunkPage = Math.min(requestedChunkPage, chunkPages);
  const harnessPage = Math.min(requestedHarnessPage, harnessPages);

  const [chunks, harnessRules] = await Promise.all([
    prisma.ragChunk.findMany({
      where: { status: "PENDING_REVIEW" },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            metadata: true,
            audience: true,
            visibility: true,
            collection: { select: { id: true, name: true, audience: true, visibility: true } },
          },
        },
        sources: { select: { label: true, citationText: true, sourceUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (chunkPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.harnessRule.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { updatedAt: "desc" },
      skip: (harnessPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const summary = triageChunks.reduce(
    (counts, chunk) => {
      const disposition = triageFrom(chunk.metadata).disposition ?? "NEEDS_REVIEW";
      if (disposition === "READY_FOR_BATCH_APPROVAL") counts.readyForBatchApproval += 1;
      else if (disposition === "CONFLICTS_WITH_APPROVED") counts.conflictsWithApproved += 1;
      else if (disposition === "DUPLICATE_OR_UPDATE_CANDIDATE") counts.duplicateOrUpdateCandidates += 1;
      else counts.needsReview += 1;
      return counts;
    },
    { readyForBatchApproval: 0, needsReview: 0, conflictsWithApproved: 0, duplicateOrUpdateCandidates: 0 },
  );

  return { chunkTotal, harnessTotal, chunkPage, harnessPage, chunkPages, harnessPages, summary, chunks, harnessRules };
}

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return database.reason === "missing" ? (
      <DatabaseSetupRequired />
    ) : (
      <DatabaseConnectionFailed maskedUrl={database.maskedUrl} />
    );
  }

  const localReviewFailure = getLocalReviewModeFailure();
  if (localReviewFailure) {
    return <LocalReviewDisabled message={localReviewFailure} />;
  }

  const params = await searchParams;
  const requestedChunkPage = parsePage(params.chunkPage);
  const requestedHarnessPage = parsePage(params.harnessPage);
  const data = await loadReviewData(requestedChunkPage, requestedHarnessPage);
  const { chunkPage, harnessPage, chunkPages, harnessPages } = data;

  return (
    <main className="flex h-full flex-col overflow-auto bg-white px-4 py-6 text-black">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-blue-600">Local review surface</p>
              <h1 className="text-2xl font-semibold tracking-tight text-black">Review pending knowledge</h1>
            </div>
            <DevDisconnectToggle />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-black/60">
            This page is local-only and reads pending review items directly from your configured Postgres database. Approvals and rejections are server actions guarded to refuse production runtimes.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Conflicts" value={data.summary.conflictsWithApproved} tone="high" />
          <SummaryCard label="Duplicates/updates" value={data.summary.duplicateOrUpdateCandidates} tone="medium" />
          <SummaryCard label="Needs review" value={data.summary.needsReview} tone="medium" />
          <SummaryCard label="Batch-ready" value={data.summary.readyForBatchApproval} tone="low" />
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-black">Pending chunks</h2>
              <p className="text-xs text-black/50">Approve or reject each chunk directly here. Items only appear here when the MCP routed them to review; each card explains why.</p>
            </div>
            <Pagination chunkPage={chunkPage} harnessPage={harnessPage} current={chunkPage} total={chunkPages} target="chunk" />
          </div>

          {data.chunks.length === 0 ? (
            <EmptyState text="No pending chunks." />
          ) : (
            <div className="space-y-3">
              {data.chunks.map((chunk) => {
                const triage = triageFrom(chunk.metadata ?? chunk.document.metadata);
                const reviewReason = reviewReasonFrom(chunk.metadata ?? chunk.document.metadata, triage);
                return (
                  <article key={chunk.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${priorityClass(triage.priority)}`}>{triage.disposition ?? "NEEDS_REVIEW"}</span>
                          {typeof triage.confidence === "number" && <span className="text-xs text-black/45">{Math.round(triage.confidence * 100)}% confidence</span>}
                          <AudienceBadge audience={chunk.document.audience} />
                          <VisibilityBadges visibility={chunk.document.visibility} />
                          {chunk.document.collection && <span className="text-xs text-black/45">{chunk.document.collection.name}</span>}
                        </div>
                        <h3 className="text-sm font-semibold text-black">{chunk.document.title}</h3>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          <p className="font-semibold">Why this is in review: {reviewReason.title ?? "Needs human review"}</p>
                          {(reviewReason.summary ?? triage.summary) && <p className="mt-1">{reviewReason.summary ?? triage.summary}</p>}
                          {reviewReason.reasons && reviewReason.reasons.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {reviewReason.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          )}
                          {(reviewReason.recommendedAction ?? triage.recommendedAction) && <p className="mt-2 font-medium">{reviewReason.recommendedAction ?? triage.recommendedAction}</p>}
                        </div>
                        <p className="max-h-36 overflow-auto whitespace-pre-wrap text-sm leading-6 text-black/75">{chunk.chunkText}</p>
                      </div>
                      <div className="grid w-full gap-2 sm:w-72">
                        <form action={rejectChunkAction} className="flex gap-2">
                          <input type="hidden" name="chunkId" value={chunk.id} />
                          <input name="notes" required placeholder="Reject reason" className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 px-2 text-xs" />
                          <Button type="submit" variant="outline" size="sm" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50">
                            <ThumbsDown data-icon="inline-start" className="size-4" /> Reject
                          </Button>
                        </form>
                        <form action={approveChunkAction}>
                          <input type="hidden" name="chunkId" value={chunk.id} />
                          <Button type="submit" size="sm" className="w-full rounded-lg">
                            <ThumbsUp data-icon="inline-start" className="size-4" /> Approve
                          </Button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-black">Pending harness rules</h2>
              <p className="text-xs text-black/50">Harness approvals affect the assistant prompt, so review them more conservatively.</p>
            </div>
            <Pagination chunkPage={chunkPage} harnessPage={harnessPage} current={harnessPage} total={harnessPages} target="harness" />
          </div>

          {data.harnessRules.length === 0 ? (
            <EmptyState text="No pending harness rules." />
          ) : (
            <div className="space-y-3">
              {data.harnessRules.map((rule) => (
                <article key={rule.id} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          <ShieldCheck className="mr-1 size-3" /> {rule.kind}
                        </span>
                        <ScopeBadge scope={rule.scope} />
                      </div>
                      <p className="text-sm leading-6 text-black/80">{rule.statement}</p>
                      {rule.reason && <p className="text-xs leading-5 text-black/50">{rule.reason}</p>}
                    </div>
                    <div className="grid w-full gap-2 sm:w-72">
                      <form action={rejectHarnessRuleAction} className="flex gap-2">
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input name="reviewNotes" required placeholder="Reject reason" className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 px-2 text-xs" />
                        <Button type="submit" variant="outline" size="sm" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50">
                          <ThumbsDown data-icon="inline-start" className="size-4" /> Reject
                        </Button>
                      </form>
                      <form action={approveHarnessRuleAction}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <Button type="submit" size="sm" className="w-full rounded-lg">
                          <ThumbsUp data-icon="inline-start" className="size-4" /> Approve
                        </Button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "high" | "medium" | "low" }) {
  const toneClass = tone === "high" ? "border-red-200 bg-red-50 text-red-700" : tone === "low" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Pagination({ chunkPage, harnessPage, current, total, target }: { chunkPage: number; harnessPage: number; current: number; total: number; target: "chunk" | "harness" }) {
  const previousChunkPage = target === "chunk" ? Math.max(1, current - 1) : chunkPage;
  const nextChunkPage = target === "chunk" ? Math.min(total, current + 1) : chunkPage;
  const previousHarnessPage = target === "harness" ? Math.max(1, current - 1) : harnessPage;
  const nextHarnessPage = target === "harness" ? Math.min(total, current + 1) : harnessPage;

  return (
    <div className="flex items-center gap-2 text-xs text-black/50">
      <Link
        href={pageHref(previousChunkPage, previousHarnessPage)}
        aria-disabled={current <= 1}
        className={current <= 1 ? "pointer-events-none inline-flex size-8 items-center justify-center rounded-lg border border-black/10 text-black/25" : "inline-flex size-8 items-center justify-center rounded-lg border border-black/10 text-black/60 hover:bg-black/5 hover:text-black"}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span>Page {current} of {total}</span>
      <Link
        href={pageHref(nextChunkPage, nextHarnessPage)}
        aria-disabled={current >= total}
        className={current >= total ? "pointer-events-none inline-flex size-8 items-center justify-center rounded-lg border border-black/10 text-black/25" : "inline-flex size-8 items-center justify-center rounded-lg border border-black/10 text-black/60 hover:bg-black/5 hover:text-black"}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-8 text-center text-sm text-black/45">{text}</div>;
}

function LocalReviewDisabled({ message }: { message: string }) {
  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-white px-6">
      <section className="w-full max-w-2xl space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-black/50">Local review unavailable</p>
        <h1 className="text-3xl font-semibold tracking-tight text-black">The direct database review UI is local-only.</h1>
        <p className="text-base leading-7 text-black/70">{message}</p>
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm leading-6 text-black/60">
          Set <code>ENABLE_TESTING_SURFACE=true</code> in local development and run the app with <code>npm run dev</code> to use this page.
        </div>
      </section>
    </main>
  );
}
