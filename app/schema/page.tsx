import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSchemaGraph } from "@/lib/schema-graph";
import { SchemaFlowLoader } from "./schema-flow-loader";

// Reads the .prisma file on disk (like any other source file) and normalizes
// it into a node/edge graph. No database connection, no Prisma Client, no API
// call — the page only ever exposes the *shape* of the RAG/harness schema.
function getSchemaGraph() {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf-8");
  return buildSchemaGraph(schema);
}

export default function SchemaPage() {
  return (
    <div className="h-full w-full">
      <SchemaFlowLoader graph={getSchemaGraph()} />
    </div>
  );
}
