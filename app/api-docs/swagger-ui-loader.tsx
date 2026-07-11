"use client";

import dynamic from "next/dynamic";

// swagger-ui-react touches browser-only globals at load time — never render
// it on the server. `ssr: false` must be called from within a Client
// Component boundary (Next.js App Router restriction), which is why this
// file exists separately from the server-rendered page.tsx.
const SwaggerUiClient = dynamic(
  () => import("./swagger-ui-client").then((mod) => mod.SwaggerUiClient),
  { ssr: false },
);

export function SwaggerUiLoader() {
  return <SwaggerUiClient />;
}
