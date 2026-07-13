import { describe, expect, it } from "vitest";
import { buildRetrievalAliases, retrievalTextForEmbedding, withRetrievalAliases } from "./retrieval-enrichment";

describe("retrieval enrichment", () => {
  it("generates human-reviewable aliases and natural questions for a startup/company chunk", () => {
    const aliases = buildRetrievalAliases({
      title: "Coase Index reference",
      chunkText: "Coase is a startup building an index for franchise disclosure documents.",
      category: "strategy",
      domain: "Coase",
      tags: ["franchise"],
    });

    expect(aliases).toContain("Coase");
    expect(aliases).toContain("company");
    expect(aliases).toContain("business");
    expect(aliases).toContain("what does Coase do?");
    expect(aliases).toContain("tell me about the company");
  });

  it("stores aliases in chunk metadata without dropping existing metadata", () => {
    expect(withRetrievalAliases({ insertedBy: "test" }, ["Coase", "company"])).toEqual({
      insertedBy: "test",
      retrievalAliases: ["Coase", "company"],
    });
  });

  it("folds aliases into embedding text", () => {
    expect(retrievalTextForEmbedding("Coase is a startup.", ["company", "business"])).toContain(
      "Retrieval aliases: company; business",
    );
  });
});
