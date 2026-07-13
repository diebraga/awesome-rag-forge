"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";

import { AudienceBadge, VisibilityBadges } from "@/components/knowledge-boundary-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { testingFetch } from "@/lib/testing-api-client";

type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  domain: string | null;
  tags: string[];
  audience: string;
  visibility: string[];
  approvedDocumentCount: number;
  approvedChunkCount: number;
};

type CollectionsResponse = {
  ok: boolean;
  collections?: CollectionSummary[];
  error?: string;
  page?: number;
  pageSize?: number;
  totalCollections?: number;
  totalPages?: number;
};

async function fetchCollections(url: string): Promise<CollectionsResponse> {
  const response = await testingFetch(url);
  return response.json();
}

function CollectionsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} className="rounded-xl border border-black/10 px-4 py-3">
          <Skeleton className="h-4 w-2/5" />
          <div className="mt-2 flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

export default function CollectionsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/rag/collections?page=${page}&pageSize=${pageSize}`,
    fetchCollections,
    { keepPreviousData: true },
  );


  const collections = data?.collections ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCollections = data?.totalCollections ?? collections.length;
  const errorMessage = data && !data.ok ? data.error : error ? "Unable to reach the server." : null;

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-white px-4 py-6 text-black">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-blue-600">
            Read-only knowledge base viewer
          </p>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-black">Collections</h1>
            {isValidating && !isLoading && (
              <span className="text-xs text-black/40">Refreshing...</span>
            )}
          </div>
          <p className="text-sm leading-6 text-black/60">
            The approved collections in this knowledge base — the same content the chat can
            see, nothing more. Click a collection to browse what&apos;s inside it.
          </p>
        </header>

        {isLoading && !data && <CollectionsSkeleton />}
        {errorMessage && <p className="text-sm text-black/50">{errorMessage}</p>}
        {data?.ok && collections.length === 0 && (
          <p className="text-sm text-black/50">
            No approved collections yet. Add and approve knowledge through the MCP server to
            see it here.
          </p>
        )}

        {data?.ok && collections.length > 0 && (
          <>
            <ul className="space-y-3">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <Link
                    href={`/collections/${collection.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 hover:border-black/20"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-black">{collection.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AudienceBadge audience={collection.audience} />
                        <VisibilityBadges visibility={collection.visibility} />
                      </div>
                      <p className="truncate text-xs text-black/50">
                        {collection.approvedChunkCount} chunk
                        {collection.approvedChunkCount === 1 ? "" : "s"} ·{" "}
                        {collection.approvedDocumentCount} document
                        {collection.approvedDocumentCount === 1 ? "" : "s"}
                      </p>
                      {(collection.category || collection.domain) && (
                        <p className="truncate text-xs text-blue-600">
                          {[collection.category, collection.domain].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-black/40" />
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
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
                  Page {data.page ?? page} of {totalPages} · {totalCollections} collection
                  {totalCollections === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
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
