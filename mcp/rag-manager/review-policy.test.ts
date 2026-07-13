import { describe, expect, it } from "vitest";
import { knowledgePersistencePolicy } from "./review-policy";
import type { ReviewTriage } from "./review-triage";

function triage(overrides: Partial<ReviewTriage>): ReviewTriage {
  return {
    disposition: "READY_FOR_BATCH_APPROVAL",
    confidence: 0.88,
    priority: "LOW",
    summary: "Clean source.",
    reasons: ["No review warnings were raised."],
    recommendedAction: "Use immediately.",
    trustedUseBlocked: false,
    ...overrides,
  };
}

describe("knowledgePersistencePolicy", () => {
  it("makes clean knowledge live immediately", () => {
    const policy = knowledgePersistencePolicy(triage({}));

    expect(policy.documentStatus).toBe("APPROVED");
    expect(policy.chunkStatus).toBe("APPROVED");
    expect(policy.requiresReview).toBe(false);
    expect(policy.reviewReason.title).toBe("Added directly to brain");
  });

  it("routes ambiguous/problematic knowledge to review with human-readable reasons", () => {
    const policy = knowledgePersistencePolicy(
      triage({
        disposition: "DUPLICATE_OR_UPDATE_CANDIDATE",
        priority: "MEDIUM",
        summary: "This may update an existing document.",
        reasons: ["Meaningful text overlap with an existing document."],
        recommendedAction: "Review whether this should update the existing document.",
        trustedUseBlocked: true,
      }),
    );

    expect(policy.documentStatus).toBe("PENDING_REVIEW");
    expect(policy.chunkStatus).toBe("PENDING_REVIEW");
    expect(policy.requiresReview).toBe(true);
    expect(policy.reviewReason.title).toBe("Possible duplicate or update");
    expect(policy.reviewReason.reasons).toContain("Meaningful text overlap with an existing document.");
  });
});
