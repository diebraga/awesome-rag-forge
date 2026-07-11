"use client";

import dynamic from "next/dynamic";
import type { SchemaGraph } from "@/lib/schema-graph";

// React Flow measures the DOM at mount, so it must render client-side only.
// `ssr: false` has to be called from within a Client Component boundary
// (Next.js App Router restriction) — same pattern as the Swagger UI loader.
const SchemaFlow = dynamic(() => import("./schema-flow").then((mod) => mod.SchemaFlow), {
  ssr: false,
});

export function SchemaFlowLoader({ graph }: { graph: SchemaGraph }) {
  return <SchemaFlow graph={graph} />;
}
