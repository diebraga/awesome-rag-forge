"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { AudienceBadge, VisibilityBadges } from "@/components/knowledge-boundary-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { testingFetch } from "@/lib/testing-api-client";

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

function DocumentCard({ document }: { document: CollectionDetailDocument }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-black/10">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
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
          <ChevronDown className="size-4 shrink-0 text-black/40" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-black/40" />
        )}
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-black/10 px-4 py-3">
          {document.chunks.length === 0 && (
            <p className="text-xs text-black/50">No approved chunks in this document.</p>
          )}
          {document.chunks.map((chunk) => (
            <div key={chunk.id} className="space-y-1">
              {chunk.sectionTitle && (
                <p className="text-xs font-medium text-blue-600">{chunk.sectionTitle}</p>
              )}
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
  const { data, error, isLoading, isValidating } = useSWR(
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
            </header>

            <div className="space-y-3">
              {data.documents?.length === 0 && (
                <p className="text-sm text-black/50">No approved documents in this collection.</p>
              )}
              {data.documents?.map((document) => (
                <DocumentCard key={document.id} document={document} />
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
