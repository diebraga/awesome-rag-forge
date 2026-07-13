"use client";

import { useState } from "react";
import useSWR from "swr";

import { ScopeBadge } from "@/components/knowledge-boundary-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { testingFetch } from "@/lib/testing-api-client";

type HarnessRule = {
  id: string;
  kind: "CAPABILITY" | "RESTRICTION";
  statement: string;
  scope: string;
};

type HarnessResponse = {
  ok: boolean;
  name?: string;
  instructions?: string | null;
  capabilities?: string[];
  restrictions?: string[];
  rules?: HarnessRule[];
  page?: number;
  pageSize?: number;
  totalRules?: number;
  totalPages?: number;
  error?: string;
};

async function fetchHarness(url: string): Promise<HarnessResponse> {
  const response = await testingFetch(url);
  return response.json();
}

function Badge({ children, tone, scope }: { children: React.ReactNode; tone: "capability" | "restriction"; scope?: string }) {
  return (
    <li
      className={
        tone === "capability"
          ? "rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-black"
          : "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>{children}</span>
        {scope && <ScopeBadge scope={scope} />}
      </div>
    </li>
  );
}

function HarnessSkeleton() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-3/4" />
      </section>
      <section className="space-y-2">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-lg" />
        ))}
      </section>
    </div>
  );
}

export default function HarnessPage() {
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/rag/harness?page=${page}&pageSize=${pageSize}`,
    fetchHarness,
    { keepPreviousData: true },
  );

  const status: "loading" | "ready" | "error" = isLoading && !data ? "loading" : data?.ok ? "ready" : "error";
  const capabilityRules = data?.rules?.filter((rule) => rule.kind === "CAPABILITY");
  const restrictionRules = data?.rules?.filter((rule) => rule.kind === "RESTRICTION");
  const totalPages = data?.totalPages ?? 1;
  const totalRules = data?.totalRules ?? data?.rules?.length ?? 0;

  return (
    <main className="h-full overflow-y-auto bg-white px-4 py-6 text-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-blue-600">
            Read-only knowledge base viewer
          </p>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-black">Harness</h1>
            {isValidating && !isLoading && (
              <span className="text-xs text-black/40">Refreshing...</span>
            )}
          </div>
          <p className="text-sm leading-6 text-black/60">
            What the chat is configured to do and not do. These rules are set exclusively
            through the MCP server&apos;s propose-and-approve workflow — nothing here can be
            changed from the chat itself.
          </p>
        </header>

        {status === "loading" && <HarnessSkeleton />}
        {status === "error" && (
          <p className="text-sm text-black/50">
            {data?.error ?? (error ? "Unable to reach the server." : "Unable to load harness configuration.")}
          </p>
        )}

        {status === "ready" && data && (
          <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-black">Identity</h2>
              <p className="text-sm text-black/70">
                The chat introduces itself as <span className="font-medium text-black">{data.name}</span>.
                {data.instructions && (
                  <>
                    {" "}
                    Additional owner instructions: <span className="text-black/60">{data.instructions}</span>
                  </>
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-black">Capabilities</h2>
              {capabilityRules && capabilityRules.length > 0 ? (
                <ul className="space-y-2">
                  {capabilityRules.map((rule) => (
                    <Badge key={rule.id} tone="capability" scope={rule.scope}>
                      {rule.statement}
                    </Badge>
                  ))}
                </ul>
              ) : data.capabilities && data.capabilities.length > 0 && page === 1 ? (
                <ul className="space-y-2">
                  {data.capabilities.map((capability) => (
                    <Badge key={capability} tone="capability">
                      {capability}
                    </Badge>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-black/50">No capabilities on this page.</p>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-black">Restrictions</h2>
              {restrictionRules && restrictionRules.length > 0 ? (
                <ul className="space-y-2">
                  {restrictionRules.map((rule) => (
                    <Badge key={rule.id} tone="restriction" scope={rule.scope}>
                      {rule.statement}
                    </Badge>
                  ))}
                </ul>
              ) : data.restrictions && data.restrictions.length > 0 && page === 1 ? (
                <ul className="space-y-2">
                  {data.restrictions.map((restriction) => (
                    <Badge key={restriction} tone="restriction">
                      {restriction}
                    </Badge>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-black/50">No restrictions on this page.</p>
              )}
            </section>

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
                  Page {data.page ?? page} of {totalPages} · {totalRules} rule
                  {totalRules === 1 ? "" : "s"}
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
