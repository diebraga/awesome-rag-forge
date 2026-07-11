"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { testingFetch } from "@/lib/testing-api-client";
type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  domain: string | null;
  tags: string[];
  approvedDocumentCount: number;
  approvedChunkCount: number;
};

type CollectionsResponse = {
  ok: boolean;
  collections?: CollectionSummary[];
  error?: string;
};

export default function CollectionsPage() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    testingFetch("/api/rag/collections")
      .then((response) => response.json())
      .then((data: CollectionsResponse) => {
        if (cancelled) return;
        if (!data.ok || !data.collections) {
          setErrorMessage(data.error ?? "Unable to load collections.");
          setStatus("error");
          return;
        }
        setCollections(data.collections);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage("Unable to reach the server.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-white px-4 py-6 text-black">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-blue-600">
            Read-only knowledge base viewer
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-black">Collections</h1>
          <p className="text-sm leading-6 text-black/60">
            The approved collections in this knowledge base — the same content the chat can
            see, nothing more. Click a collection to browse what&apos;s inside it.
          </p>
        </header>

        {status === "loading" && <p className="text-sm text-black/50">Loading...</p>}
        {status === "error" && <p className="text-sm text-black/50">{errorMessage}</p>}
        {status === "ready" && collections.length === 0 && (
          <p className="text-sm text-black/50">
            No approved collections yet. Add and approve knowledge through the MCP server to
            see it here.
          </p>
        )}

        {status === "ready" && collections.length > 0 && (
          <ul className="space-y-3">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/collections/${collection.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 hover:border-black/20"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-black">{collection.name}</p>
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
        )}
      </div>
    </main>
  );
}
