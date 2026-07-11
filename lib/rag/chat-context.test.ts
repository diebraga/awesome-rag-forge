import { describe, expect, it } from "vitest";
import { buildSystemPromptForTest } from "./chat-context";

describe("chat context system prompt", () => {
  it("tells the model knowledge-base definitions beat world knowledge", () => {
    const prompt = buildSystemPromptForTest({
      name: "Archivist",
      stats: { collectionCount: 1, documentCount: 1, approvedChunkCount: 1, categories: [], domains: [], tags: [] },
      capabilities: [],
      restrictions: [],
    });

    expect(prompt).toContain("takes precedence over your own world knowledge");
    expect(prompt).toContain("do not substitute the more common real-world meaning");
  });
});
