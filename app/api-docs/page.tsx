import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { TestingSurfaceDisabled } from "../testing-surface-disabled";
import { SwaggerUiLoader } from "./swagger-ui-loader";

export const metadata = {
  title: "API Docs",
};

/**
 * API docs are part of the local testing surface. The app-wide connection
 * gate (app/layout.tsx) already guarantees a live database connection
 * before this page can render at all; this only additionally requires
 * ENABLE_TESTING_SURFACE=true, matching the API routes they describe. The
 * spec still contains schema only, never real data.
 */
export default async function ApiDocsPage() {

  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-white px-4 py-6 text-black">
      <section className="mx-auto w-full max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium tracking-wide text-blue-600">API documentation</p>
            <h1 className="text-xl font-semibold tracking-tight text-black">
              Read-only RAG API
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-black/60">
              Generate a client in any language from this spec (e.g. via{" "}
              <a
                href="https://openapi-generator.tech"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline underline-offset-2"
              >
                openapi-generator
              </a>
              ) — this API is not tied to this project&apos;s own UI or stack.
            </p>
          </div>
          <a
            href="/api-docs/openapi.json"
            download
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
          >
            <Download data-icon="inline-start" className="size-4" />
            Download spec
          </a>
        </header>

        <div className="rounded-xl border border-black/10 p-1">
          <SwaggerUiLoader />
        </div>
      </section>
    </main>
  );
}
