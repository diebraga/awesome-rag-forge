import { describe, expect, it } from "vitest";
import { buildSchemaGraph } from "./schema-graph";

const SAMPLE = `
model RagCollection {
  id        String        @id @default(cuid())
  name      String
  documents RagDocument[]
}

model RagDocument {
  id           String        @id @default(cuid())
  collectionId String
  collection   RagCollection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  title        String
  status       RagStatus     @default(DRAFT)

  @@index([collectionId])
}

model AssistantConfig {
  id   String @id @default(cuid())
  name String
}
`;

describe("buildSchemaGraph", () => {
  const { nodes, edges } = buildSchemaGraph(SAMPLE);

  it("includes allowed models and excludes AssistantConfig", () => {
    const ids = nodes.map((node) => node.id);
    expect(ids).toContain("RagCollection");
    expect(ids).toContain("RagDocument");
    expect(ids).not.toContain("AssistantConfig");
  });

  it("emits exactly one edge from the foreign-key-owning side", () => {
    expect(edges).toEqual([
      { id: "RagDocument-RagCollection-collection", source: "RagDocument", target: "RagCollection", label: "collection" },
    ]);
  });

  it("keeps scalar/enum fields and drops relation navigation fields", () => {
    const document = nodes.find((node) => node.id === "RagDocument");
    const fieldNames = document?.data.fields.map((field) => field.name);
    expect(fieldNames).toEqual(["id", "collectionId", "title", "status"]);
    // The `collection` nav field and `RagCollection.documents` list are not columns.
    expect(fieldNames).not.toContain("collection");
    expect(document?.data.fields.find((f) => f.name === "status")?.type).toBe("RagStatus");
  });

  it("gives every node a deterministic position", () => {
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].position).toEqual({ x: 340, y: 0 });
  });
});
