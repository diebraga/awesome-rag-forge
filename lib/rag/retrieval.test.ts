import { describe, expect, it } from "vitest";
import { isSemanticDistanceRelevant, rankRagChunksForQuery, type RagContextChunk } from "./retrieval";

function chunk(
  overrides: Omit<Partial<RagContextChunk>, "document"> & {
    title: string;
    text: string;
    updatedAt?: Date;
    document?: Partial<RagContextChunk["document"]>;
  },
): RagContextChunk {
  return {
    chunkText: overrides.text,
    sectionTitle: overrides.sectionTitle ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    document: {
      id: overrides.document?.id ?? overrides.title.toLowerCase().replaceAll(" ", "-"),
      title: overrides.title,
      category: overrides.document?.category ?? null,
      domain: overrides.document?.domain ?? null,
      tags: overrides.document?.tags ?? [],
      audience: overrides.document?.audience ?? "EXTERNAL",
      visibility: overrides.document?.visibility ?? ["CHAT", "OPERATOR", "REVIEW"],
      storageKey: overrides.document?.storageKey ?? null,
      collection: overrides.document?.collection ?? {
        name: "Default collection",
        category: null,
        domain: null,
        tags: [],
        audience: "EXTERNAL",
        visibility: ["CHAT", "OPERATOR", "REVIEW"],
      },
    },
    sources: overrides.sources ?? [],
  };
}

describe("rankRagChunksForQuery", () => {
  it("matches compact acronym-like user wording to spaced knowledge titles", () => {
    const ranked = rankRagChunksForQuery(
      [
        chunk({
          title: "The Economist overview",
          text: "The Economist is a weekly newspaper focused on current affairs and economics.",
          updatedAt: new Date("2026-07-10T00:00:00.000Z"),
        }),
        chunk({
          title: "COES eindex reference",
          text: "COES eindex measures the relationship captured by the uploaded COES material.",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      "What is COEse?",
    );

    expect(ranked[0]?.document.title).toBe("COES eindex reference");
  });


  it("matches near-typo compact user wording to short knowledge names", () => {
    const ranked = rankRagChunksForQuery(
      [
        chunk({
          title: "The Economist overview",
          text: "The Economist is a weekly newspaper focused on current affairs and economics.",
          updatedAt: new Date("2026-07-10T00:00:00.000Z"),
        }),
        chunk({
          title: "Coase Index reference",
          text: "The Coase Index structures franchise disclosure data for buyer-side analysis.",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      "What is COEse?",
    );

    expect(ranked[0]?.document.title).toBe("Coase Index reference");
  });

  it("ranks document title matches above generic body matches", () => {
    const ranked = rankRagChunksForQuery(
      [
        chunk({
          title: "General notes",
          text: "This paragraph briefly mentions COES eindex once in passing.",
        }),
        chunk({
          title: "COES eindex reference",
          text: "This document defines the uploaded metric in detail.",
        }),
      ],
      "COES eindex",
    );

    expect(ranked[0]?.document.title).toBe("COES eindex reference");
  });

  it("returns no chunks when no query terms match", () => {
    const ranked = rankRagChunksForQuery(
      [
        chunk({ title: "Older approved note", text: "Alpha", updatedAt: new Date("2026-01-01T00:00:00.000Z") }),
        chunk({ title: "Newer approved note", text: "Beta", updatedAt: new Date("2026-02-01T00:00:00.000Z") }),
      ],
      "unrelated search",
    );

    expect(ranked).toEqual([]);
  });

  it("uses retrievalAliases metadata as searchable text", () => {
    const ranked = rankRagChunksForQuery(
      [
        chunk({
          title: "Coase Index reference",
          text: "Coase structures franchise disclosure documents.",
          metadata: { retrievalAliases: ["company", "business", "what does our startup do?"] },
          document: {
            id: "coase",
            category: null,
            domain: null,
            tags: [],
            audience: "EXTERNAL",
            visibility: ["CHAT", "OPERATOR", "REVIEW"],
            storageKey: null,
            collection: { name: "Strategy", category: null, domain: null, tags: [], audience: "EXTERNAL", visibility: ["CHAT", "OPERATOR", "REVIEW"] },
          },
        }),
      ],
      "tell me about the company",
    );

    expect(ranked[0]?.document.title).toBe("Coase Index reference");
  });
});

describe("isSemanticDistanceRelevant", () => {
  it("keeps only close semantic matches", () => {
    expect(isSemanticDistanceRelevant(0.42)).toBe(true);
    expect(isSemanticDistanceRelevant(0.7)).toBe(false);
    expect(isSemanticDistanceRelevant(Number.NaN)).toBe(false);
  });
});
