"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Archive, AlertTriangle, ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { AudienceBadge, VisibilityBadges } from "@/components/knowledge-boundary-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { testingFetch } from "@/lib/testing-api-client";
import { archiveChunkAction, archiveDocumentAction } from "../actions";
import { getArchiveWarning, type ArchiveTarget } from "../archive-policy";

type CollectionDetailChunk = {
  id: string;
  chunkText: string;
  sectionTitle: string | null;
  chunkIndex: number;
};

type CollectionDetailDocument = {
  id: string;
  title: string;
  category: string | null;
  domain: string | null;
  tags: string[];
  audience: string;
  visibility: string[];
  sourceType: string;
  chunks: CollectionDetailChunk[];
};

type CollectionDetailResponse = {
  ok: boolean;
  error?: string;
  collection?: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    domain: string | null;
    tags: string[];
    audience: string;
    visibility: string[];
    createdAt: string;
    updatedAt: string;
  };
  documents?: CollectionDetailDocument[];
  page?: number;
  pageSize?: number;
  totalDocuments?: number;
  totalPages?: number;
};

async function fetchCollectionDetail(url: string): Promise<CollectionDetailResponse> {
  const response = await testingFetch(url);
  return response.json();
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-black/10 px-4 py-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

type ArchiveConfirmation = {
  target: ArchiveTarget;
  id: string;
  label: string;
};

function DocumentCard({
  document,
  collectionId,
  onArchived,
}: {
  document: CollectionDetailDocument;
  collectionId: string;
  onArchived: () => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState<ArchiveConfirmation | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, startArchiveTransition] = useTransition();

  function openArchiveConfirmation(nextConfirmation: ArchiveConfirmation) {
    setArchiveConfirmation(nextConfirmation);
    setArchiveReason("");
    setArchiveError(null);
  }

  function confirmArchive() {
    if (!archiveConfirmation) return;
    const reason = archiveReason.trim();
    if (!reason) {
      setArchiveError("Add a reason before archiving this knowledge.");
      return;
    }

    const formData = new FormData();
    formData.set("collectionId", collectionId);
    formData.set("reason", reason);
    if (archiveConfirmation.target === "document") formData.set("documentId", archiveConfirmation.id);
    if (archiveConfirmation.target === "chunk") formData.set("chunkId", archiveConfirmation.id);

    startArchiveTransition(async () => {
      try {
        if (archiveConfirmation.target === "document") {
          await archiveDocumentAction(formData);
        } else {
          await archiveChunkAction(formData);
        }
        setArchiveConfirmation(null);
        setArchiveReason("");
        setArchiveError(null);
        await onArchived();
      } catch (error) {
        setArchiveError(error instanceof Error ? error.message : "Unable to archive this knowledge.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-black/10">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm font-medium text-black">{document.title}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <AudienceBadge audience={document.audience} />
              <VisibilityBadges visibility={document.visibility} />
            </div>
            <p className="truncate text-xs text-black/50">
              {[document.category, document.domain].filter(Boolean).join(" · ") ||
                document.sourceType}
              {" · "}
              {document.chunks.length} chunk{document.chunks.length === 1 ? "" : "s"}
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-black/40" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-black/40" />
          )}
        </button>
        <button
          type="button"
          onClick={() => openArchiveConfirmation({ target: "document", id: document.id, label: document.title })}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-black/40 hover:bg-black/5 hover:text-black/70"
          aria-label={`Archive document ${document.title}`}
          title="Archive document"
        >
          <Archive className="size-4" />
        </button>
      </div>

      {archiveConfirmation && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium">Archive {archiveConfirmation.target}: {archiveConfirmation.label}</p>
              <p className="text-xs leading-5 text-amber-950/80">{getArchiveWarning(archiveConfirmation.target)}</p>
              <label className="block text-xs font-medium" htmlFor={`archive-reason-${archiveConfirmation.id}`}>Reason</label>
              <input
                id={`archive-reason-${archiveConfirmation.id}`}
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder="Duplicate, outdated, incorrect, or no longer useful"
                className="h-9 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm text-black outline-none focus:border-amber-400"
              />
              {archiveError && <p className="text-xs text-amber-900">{archiveError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={isArchiving} onClick={confirmArchive}>
                  {isArchiving ? "Archiving..." : "Archive"}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isArchiving} onClick={() => setArchiveConfirmation(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-3 border-t border-black/10 px-4 py-3">
          {document.chunks.length === 0 && (
            <p className="text-xs text-black/50">No approved chunks in this document.</p>
          )}
          {document.chunks.map((chunk) => (
            <div key={chunk.id} className="space-y-1 rounded-lg border border-black/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {chunk.sectionTitle && (
                    <p className="text-xs font-medium text-blue-600">{chunk.sectionTitle}</p>
                  )}
                  <p className="text-xs text-black/40">Chunk {chunk.chunkIndex + 1}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openArchiveConfirmation({ target: "chunk", id: chunk.id, label: chunk.sectionTitle ?? `Chunk ${chunk.chunkIndex + 1}` })}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-black/40 hover:bg-black/5 hover:text-black/70"
                  aria-label={`Archive chunk ${chunk.chunkIndex + 1}`}
                  title="Archive chunk"
                >
                  <Archive className="size-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-black/80">
                {chunk.chunkText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = use(params);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/rag/collections/${collectionId}?page=${page}&pageSize=${pageSize}`,
    fetchCollectionDetail,
    { keepPreviousData: true },
  );
  const status: "loading" | "ready" | "error" = isLoading && !data ? "loading" : data?.ok ? "ready" : "error";

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-white px-4 py-6 text-black">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Link
          href="/collections"
          className="inline-flex items-center gap-1 text-sm text-black/60 hover:text-black"
        >
          <ChevronLeft className="size-4" />
          Collections
        </Link>

        {status === "loading" && <DetailSkeleton />}
        {status === "error" && (
          <p className="text-sm text-black/50">
            {data?.error ?? (error ? "Unable to reach the server." : "Unable to load this collection.")}
          </p>
        )}

        {status === "ready" && data?.collection && (
          <>
            <header className="space-y-1.5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-black">
                  {data.collection.name}
                </h1>
                {isValidating && !isLoading && (
                  <span className="text-xs text-black/40">Refreshing...</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <AudienceBadge audience={data.collection.audience} />
                <VisibilityBadges visibility={data.collection.visibility} />
              </div>
              {data.collection.description && (
                <p className="text-sm leading-6 text-black/60">{data.collection.description}</p>
              )}
              {(data.collection.category || data.collection.domain) && (
                <p className="text-xs text-blue-600">
                  {[data.collection.category, data.collection.domain]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="text-xs text-black/40">
                Added {new Date(data.collection.createdAt).toLocaleDateString()} · Last edited{" "}
                {new Date(data.collection.updatedAt).toLocaleDateString()}
              </p>
            </header>

            <div className="space-y-3">
              {data.documents?.length === 0 && (
                <p className="text-sm text-black/50">No approved documents in this collection.</p>
              )}
              {data.documents?.map((document) => (
                <DocumentCard key={document.id} document={document} collectionId={collectionId} onArchived={mutate} />
              ))}
            </div>

            {(data.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-between border-t border-black/10 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-black/50">
                  Page {data.page} of {data.totalPages} · {data.totalDocuments} document
                  {data.totalDocuments === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= (data.totalPages ?? 1)}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
