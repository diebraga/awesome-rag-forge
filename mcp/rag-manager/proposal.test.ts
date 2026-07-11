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
  });
});
