import { describe, expect, it } from "vitest";
import { buildReviewTriage } from "./review-triage";

describe("buildReviewTriage", () => {
  it("marks clean new knowledge as immediately trusted", () => {
    const triage = buildReviewTriage({
      sourceText: "Coase builds an index for franchise disclosure documents.",
      warnings: [],
      placementReview: {
        recommendation: "CREATE_NEW_DOCUMENT",
        confidence: 0.72,
        summary: "No existing document looked similar enough.",
        reasons: ["No exact match was found."],
        candidates: [],
      },
    });

    expect(triage.disposition).toBe("READY_FOR_BATCH_APPROVAL");
    expect(triage.priority).toBe("LOW");
    expect(triage.trustedUseBlocked).toBe(false);
    expect(triage.recommendedAction).toMatch(/use immediately/i);
  });

  it("prioritizes possible contradictions with approved knowledge", () => {
    const triage = buildReviewTriage({
      sourceText: "Coase no longer builds an index for franchise disclosure documents.",
      warnings: [],
      placementReview: {
        recommendation: "UPDATE_EXISTING_DOCUMENT",
        confidence: 0.91,
        summary: "Strong overlap with Coase Index reference.",
        reasons: ["Same title", "Meaningful text overlap (80%)"],
        candidates: [
          {
            documentId: "doc_coase",
            title: "Coase Index reference",
            status: "APPROVED",
            score: 91,
            overlapRatio: 0.8,
            matchingSignals: ["Same title", "Meaningful text overlap (80%)"],
          },
        ],
      },
    });

    expect(triage.disposition).toBe("CONFLICTS_WITH_APPROVED");
    expect(triage.priority).toBe("HIGH");
    expect(triage.summary).toMatch(/contradict|replace/i);
  });

  it("sends extraction and classification warnings to review", () => {
    const triage = buildReviewTriage({
      sourceText: "A long OCR-derived source.",
      warnings: ["1 of 2 page(s) had no text layer and were processed with OCR - verify accuracy before approving."],
      placementReview: {
        recommendation: "CREATE_NEW_DOCUMENT",
        confidence: 0.72,
        summary: "No existing document looked similar enough.",
        reasons: ["No exact match was found."],
        candidates: [],
      },
    });

    expect(triage.disposition).toBe("NEEDS_REVIEW");
    expect(triage.priority).toBe("MEDIUM");
    expect(triage.reasons.join(" ")).toMatch(/OCR/i);
  });
});
