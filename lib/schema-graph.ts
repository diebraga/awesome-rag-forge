// Pure, dependency-free parser that turns the Prisma schema *text* into a
// normalized node/edge graph for React Flow. It never touches the database or
// the Prisma Client — the caller reads the .prisma file and passes the string
// in, so this stays trivially unit-testable and has no runtime side effects.
//
// Only RAG/harness models are surfaced. AssistantConfig is deliberately
// excluded (see prisma/schema.prisma — it must never be presented as
// retrievable knowledge), same allowlist rationale as the text schema view.

const ALLOWED_MODELS = [
  "RagCollection",
  "RagDocument",
  "RagChunk",
  "RagSource",
  "RagFeedback",
  "RagReview",
  "HarnessRule",
  "RagEvalCase",
] as const;

const ALLOWED = new Set<string>(ALLOWED_MODELS);

export type SchemaField = { name: string; type: string };
export type SchemaNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string; fields: SchemaField[] };
};
export type SchemaEdge = { id: string; source: string; target: string; label: string };
export type SchemaGraph = { nodes: SchemaNode[]; edges: SchemaEdge[] };

const COLUMNS = 3;
const COLUMN_GAP = 340;
const ROW_GAP = 380;

export function buildSchemaGraph(schemaText: string): SchemaGraph {
  const modelBlocks = [...schemaText.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].filter(([, name]) =>
    ALLOWED.has(name),
  );

  const nodes: SchemaNode[] = [];
  const edges: SchemaEdge[] = [];

  modelBlocks.forEach(([, modelName, body], index) => {
    const fields: SchemaField[] = [];

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      // Skip blanks, closing brace fragments, and block attributes (@@index, @@unique).
      if (!line || line.startsWith("@@") || line.startsWith("//")) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const [name, rawType, ...rest] = parts;
      const attributes = rest.join(" ");
      const baseType = rawType.replace(/\[\]$/, "").replace(/\?$/, "");

      if (ALLOWED.has(baseType)) {
        // A relation navigation field. Only emit an edge from the side that
        // actually holds the foreign key (@relation(fields: ...)), so each
        // relationship produces exactly one edge instead of two. Either way
        // the nav field itself is not shown as a scalar column.
        if (attributes.includes("@relation(fields:")) {
          edges.push({
            id: `${modelName}-${baseType}-${name}`,
            source: modelName,
            target: baseType,
            label: name,
          });
        }
        continue;
      }

      fields.push({ name, type: rawType });
    }

    // ponytail: fixed grid layout, deterministic so positions are stable
    // across reloads. Swap for dagre/elk only if the graph gets unreadable.
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);

    nodes.push({
      id: modelName,
      position: { x: column * COLUMN_GAP, y: row * ROW_GAP },
      data: { label: modelName, fields },
    });
  });

  return { nodes, edges };
}
