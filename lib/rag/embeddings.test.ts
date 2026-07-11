import { describe, expect, it } from "vitest";
import { formatPgVectorLiteral, parseOllamaEmbeddingResponse } from "./embeddings";

describe("embedding helpers", () => {
  it("formats a pgvector literal", () => {
    expect(formatPgVectorLiteral([0.1, -2, 3])).toBe("[0.1,-2,3]");
  });

  it("parses Ollama embedding responses", () => {
    expect(parseOllamaEmbeddingResponse({ embedding: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(parseOllamaEmbeddingResponse({ embeddings: [[4, 5, 6]] })).toEqual([4, 5, 6]);
  });

  it("rejects non-numeric embeddings", () => {
    expect(() => parseOllamaEmbeddingResponse({ embedding: [1, "x"] })).toThrow("numeric embedding");
  });
});
