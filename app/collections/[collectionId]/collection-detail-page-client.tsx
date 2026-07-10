"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  };
  documents?: CollectionDetailDocument[];
  page?: number;
  pageSize?: number;
  totalDocuments?: number;
  totalPages?: number;
};

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
  const requestKey = `${collectionId}:${page}`;
  const [result, setResult] = useState<{ key: string; data: CollectionDetailResponse } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/rag/collections/${collectionId}?page=${page}&pageSize=10`)
      .then((response) => response.json())
      .then((json: CollectionDetailResponse) => {
        if (cancelled) return;
        setResult({ key: `${collectionId}:${page}`, data: json });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ key: `${collectionId}:${page}`, data: { ok: false, error: "Unable to reach the server." } });
      });

    return () => {
      cancelled = true;
    };
  }, [collectionId, page]);

  const isCurrent = result?.key === requestKey;
  const data = isCurrent ? result.data : null;
  const status: "loading" | "ready" | "error" = !isCurrent
    ? "loading"
    : data?.ok
      ? "ready"
      : "error";

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

        {status === "loading" && (
          <p className="text-sm text-black/50">Loading...</p>
        )}
        {status === "error" && (
          <p className="text-sm text-black/50">
            {data?.error ?? "Unable to load this collection."}
          </p>
        )}

        {status === "ready" && data?.collection && (
          <>
            <header className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-black">
                {data.collection.name}
              </h1>
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
