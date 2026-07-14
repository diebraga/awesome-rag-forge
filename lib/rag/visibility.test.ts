import { describe, expect, it } from "vitest";
import {
  buildApprovedChatChunkWhere,
  DEFAULT_KNOWLEDGE_VISIBILITY,
  inferKnowledgeVisibility,
  isExternalChatVisible,
} from "./visibility";

describe("knowledge visibility", () => {
  it("defaults new knowledge to external chat-visible reviewable knowledge", () => {
    expect(inferKnowledgeVisibility({ text: "Public product documentation for end users." })).toEqual({
      audience: "EXTERNAL",
      visibility: DEFAULT_KNOWLEDGE_VISIBILITY,
      warnings: [],
    });
  });

  it("does not expose MCP as a knowledge visibility context", () => {
    expect(DEFAULT_KNOWLEDGE_VISIBILITY).not.toContain("MCP");
  });

  it("infers internal knowledge from company-only language", () => {
    expect(inferKnowledgeVisibility({ text: "Internal company policy for operators and employees only." })).toMatchObject({
      audience: "INTERNAL",
      visibility: ["OPERATOR", "REVIEW"],
    });
  });

  it("infers restricted knowledge from secret-sensitive language", () => {
    expect(inferKnowledgeVisibility({ text: "Confidential credential rotation note with a private API key." })).toMatchObject({
      audience: "RESTRICTED",
      visibility: ["REVIEW"],
    });
  });

  it("only treats external records with chat visibility as chat-visible", () => {
    expect(isExternalChatVisible({ audience: "EXTERNAL", visibility: ["CHAT", "OPERATOR"] })).toBe(true);
    expect(isExternalChatVisible({ audience: "INTERNAL", visibility: ["CHAT", "OPERATOR"] })).toBe(false);
    expect(isExternalChatVisible({ audience: "EXTERNAL", visibility: ["OPERATOR", "REVIEW"] })).toBe(false);
  });

  it("builds the approved external chat retrieval where clause", () => {
    expect(buildApprovedChatChunkWhere()).toEqual({
      status: "APPROVED",
      OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global"] } }],
      document: {
        status: "APPROVED",
        audience: "EXTERNAL",
        visibility: { has: "CHAT" },
        OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global"] } }],
        collection: {
          audience: "EXTERNAL",
          visibility: { has: "CHAT" },
          OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global"] } }],
        },
      },
    });
  });

  it("adds active non-global scopes without removing global knowledge", () => {
    expect(buildApprovedChatChunkWhere(["scope_maria"])).toMatchObject({
      OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global", "scope_maria"] } }],
      document: {
        OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global", "scope_maria"] } }],
        collection: {
          OR: [{ scopeId: null }, { scopeId: { in: ["knowledge_scope_global", "scope_maria"] } }],
        },
      },
    });
  });
});
