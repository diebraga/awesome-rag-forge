import { describe, expect, it } from "vitest";
import { buildSourceProposal } from "./proposal";

describe("buildSourceProposal", () => {
  it("surfaces retrieval aliases in the human-reviewable chunk plan", async () => {
    const proposal = await buildSourceProposal({
      title: "Aurelia Index reference",
      sourceText: "Aurelia is a startup building an index for franchise disclosure documents.",
      sourceType: "NOTE",
      category: "synthetic-proposal-test",
      domain: "AureliaNeverExisting",
      tags: ["synthetic-franchise-test"],
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
  it("infers restricted knowledge visibility from sensitive source language", async () => {
    const proposal = await buildSourceProposal({
      title: "Credential rotation",
      sourceText: "Confidential credential rotation note with a private API key.",
      sourceType: "NOTE",
      category: "operations",
      domain: "security",
    });

    expect(proposal.proposedCollection.audience).toBe("RESTRICTED");
    expect(proposal.proposedDocument.audience).toBe("RESTRICTED");
    expect(proposal.proposedDocument.visibility).toEqual(["REVIEW"]);
  });

  it("asks the caller to confirm the audience when one was not provided", async () => {
    const proposal = await buildSourceProposal({
      title: "Audience choice",
      sourceText: "A reusable product note for the knowledge base.",
      sourceType: "NOTE",
      category: "product",
      domain: "docs",
    });

    expect(proposal.requiredUserQuestions).toContain(
      "Choose the audience for this knowledge: EXTERNAL (end-user/shareable), INTERNAL (operator/private), or RESTRICTED (sensitive/high-risk).",
    );
  });

});
