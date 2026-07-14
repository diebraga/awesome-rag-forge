import { describe, expect, it } from "vitest";
import { parsePortableBrainSnapshot, summarizePortableBrainSnapshot } from "./portable-brain";

const emptySnapshot = {
  kind: "awesome-rag-forge.portable-brain",
  version: 1,
  exportedAt: "2026-07-14T00:00:00.000Z",
  options: {
    includePendingReview: false,
    includeFeedbackAndReviews: false,
    includeEmbeddings: false,
  },
  warnings: [],
  data: {
    knowledgeScopes: [{ id: "knowledge_scope_global" }],
    ragCollections: [{ id: "col_1" }],
    ragDocuments: [],
    ragChunks: [],
    ragSources: [],
    ragFeedback: [],
    ragReviews: [],
    assistantConfigs: [],
    harnessRules: [],
    ragEvalCases: [],
  },
};

describe("portable brain snapshots", () => {
  it("summarizes snapshot row counts", () => {
    expect(summarizePortableBrainSnapshot(parsePortableBrainSnapshot(emptySnapshot))).toEqual({
      scopes: 1,
      collections: 1,
      documents: 0,
      chunks: 0,
      sources: 0,
      feedback: 0,
      reviews: 0,
      assistantConfigs: 0,
      harnessRules: 0,
      evalCases: 0,
    });
  });

  it("rejects snapshots from another format", () => {
    expect(() => parsePortableBrainSnapshot({ ...emptySnapshot, kind: "other" })).toThrow();
  });
});
