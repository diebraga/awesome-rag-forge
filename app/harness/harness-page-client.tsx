"use client";

import { useEffect, useState } from "react";

import { testingFetch } from "@/lib/testing-api-client";
type HarnessResponse = {
  ok: boolean;
  name?: string;
  instructions?: string | null;
  capabilities?: string[];
  restrictions?: string[];
  error?: string;
};

function Badge({ children, tone }: { children: React.ReactNode; tone: "capability" | "restriction" }) {
  return (
    <li
      className={
        tone === "capability"
          ? "rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-black"
          : "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black"
      }
    >
      {children}
    </li>
  );
}

export default function HarnessPage() {
  const [data, setData] = useState<HarnessResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    testingFetch("/api/rag/harness")
      .then((response) => response.json())
      .then((result: HarnessResponse) => {
        if (cancelled) return;
        setData(result);
        setStatus(result.ok ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="h-full overflow-y-auto bg-white px-4 py-6 text-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-blue-600">
            Read-only knowledge base viewer
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-black">Harness</h1>
          <p className="text-sm leading-6 text-black/60">
            What the chat is configured to do and not do. These rules are set exclusively
            through the MCP server&apos;s propose-and-approve workflow — nothing here can be
            changed from the chat itself.
          </p>
        </header>

        {status === "loading" && <p className="text-sm text-black/50">Loading...</p>}
        {status === "error" && (
          <p className="text-sm text-black/50">{data?.error ?? "Unable to load harness configuration."}</p>
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
              {data.capabilities && data.capabilities.length > 0 ? (
                <ul className="space-y-2">
                  {data.capabilities.map((capability) => (
                    <Badge key={capability} tone="capability">
                      {capability}
                    </Badge>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-black/50">No capabilities configured.</p>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-black">Restrictions</h2>
              {data.restrictions && data.restrictions.length > 0 ? (
                <ul className="space-y-2">
                  {data.restrictions.map((restriction) => (
                    <Badge key={restriction} tone="restriction">
                      {restriction}
                    </Badge>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-black/50">No restrictions configured.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
