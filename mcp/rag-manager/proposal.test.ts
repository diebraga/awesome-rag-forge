import { describe, expect, it } from "vitest";
import { buildSourceProposal } from "./proposal";

describe("buildSourceProposal", () => {
  it("surfaces retrieval aliases in the human-reviewable chunk plan", async () => {
    const proposal = await buildSourceProposal({
      title: "Coase Index reference",
      sourceText: "Coase is a startup building an index for franchise disclosure documents.",
      sourceType: "NOTE",
      category: "strategy",
      domain: "Coase",
      tags: ["franchise"],
    });

    expect(proposal.chunkPlan[0]?.retrievalAliases).toContain("company");
    expect(proposal.chunkPlan[0]?.retrievalAliases).toContain("tell me about the company");
    expect(proposal.placementReview.recommendation).toBe("CREATE_NEW_DOCUMENT");
    expect(proposal.placementReview.summary).toMatch(/new document/i);
    expect(proposal.reviewTriage.disposition).toBe("READY_FOR_BATCH_APPROVAL");
    expect(proposal.reviewTriage.trustedUseBlocked).toBe(true);
  });

  it("routes unclassified source proposals to review instead of batch approval", async () => {
    const proposal = await buildSourceProposal({
      title: "Unclassified note",
      sourceText: "This note has enough information to save, but no domain or category.",
      sourceType: "NOTE",
    });

    expect(proposal.reviewStatus).toBe("PENDING_REVIEW");
    expect(proposal.reviewTriage.disposition).toBe("NEEDS_REVIEW");
    expect(proposal.reviewTriage.recommendedAction).toMatch(/review/i);
  });
});
