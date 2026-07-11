import { describe, expect, it } from "vitest";
import { buildPlacementReview, createContentFingerprint } from "./placement-intelligence";

describe("placement intelligence", () => {
  it("recommends updating an existing document when the new source is a near-overlapping revision", () => {
    const review = buildPlacementReview({
      title: "Cohesive Strategy",
      sourceText: "Cohesive strategy expands the Coase index thesis for franchise buyers, lawyer rails, and the buyer side of the market.",
      category: "strategy",
      domain: "Coase",
      tags: ["franchise"],
      candidates: [
        {
          id: "doc_coase_strategy",
          title: "Coase Strategy",
          category: "strategy",
          domain: "Coase",
          tags: ["franchise"],
          chunkTexts: ["Coase strategy explains the index, franchise buyers, lawyer rails, and the buyer side of the market."],
        },
      ],
    });

    expect(review.recommendation).toBe("UPDATE_EXISTING_DOCUMENT");
    expect(review.candidates[0]?.documentId).toBe("doc_coase_strategy");
    expect(review.reasons.join(" ")).toMatch(/overlap/i);
  });

  it("recommends skipping exact duplicate content", () => {
    const sourceText = "Same document body with the same facts.";
    const fingerprint = createContentFingerprint(sourceText);

    const review = buildPlacementReview({
      title: "Repeated note",
      sourceText,
      candidates: [
        {
          id: "doc_repeat",
          title: "Repeated note",
          chunkTexts: [sourceText],
          metadata: { contentFingerprint: fingerprint },
        },
      ],
    });

    expect(review.recommendation).toBe("DUPLICATE_SKIP");
    expect(review.confidence).toBeGreaterThanOrEqual(0.95);
  });
});
