export const KNOWLEDGE_AUDIENCES = ["EXTERNAL", "INTERNAL", "RESTRICTED"] as const;
export const KNOWLEDGE_VISIBILITY_SCOPES = ["CHAT", "OPERATOR", "REVIEW", "EVAL"] as const;
export const HARNESS_RULE_SCOPES = ["USER_CHAT", "OPERATOR_AGENT", "MCP_AGENT", "ALL"] as const;

export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITY_SCOPES)[number];
export type HarnessScope = (typeof HARNESS_RULE_SCOPES)[number];

export const DEFAULT_KNOWLEDGE_VISIBILITY: KnowledgeVisibility[] = ["CHAT", "OPERATOR", "REVIEW"];
export const INTERNAL_KNOWLEDGE_VISIBILITY: KnowledgeVisibility[] = ["OPERATOR", "REVIEW"];
export const RESTRICTED_KNOWLEDGE_VISIBILITY: KnowledgeVisibility[] = ["REVIEW"];

const INTERNAL_PATTERNS: RegExp[] = [
  /\binternal\b/i,
  /\bcompany[- ]only\b/i,
  /\boperators?\b/i,
  /\bemployees? only\b/i,
  /\bstaff only\b/i,
  /\bback[- ]office\b/i,
];

const RESTRICTED_PATTERNS: RegExp[] = [
  /\bconfidential\b/i,
  /\bprivate\b/i,
  /\bsecret\b/i,
  /\bcredential\b/i,
  /\bapi key\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\baccess key\b/i,
];

function normalizeVisibility(visibility: KnowledgeVisibility[]) {
  return [...new Set(visibility)];
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferKnowledgeVisibility(input: {
  text: string;
  audience?: KnowledgeAudience;
  visibility?: KnowledgeVisibility[];
}): { audience: KnowledgeAudience; visibility: KnowledgeVisibility[]; warnings: string[] } {
  const explicitAudience = input.audience;
  const inferredAudience: KnowledgeAudience = explicitAudience
    ?? (hasPattern(input.text, RESTRICTED_PATTERNS) ? "RESTRICTED" : hasPattern(input.text, INTERNAL_PATTERNS) ? "INTERNAL" : "EXTERNAL");

  const defaultVisibility =
    inferredAudience === "RESTRICTED"
      ? RESTRICTED_KNOWLEDGE_VISIBILITY
      : inferredAudience === "INTERNAL"
        ? INTERNAL_KNOWLEDGE_VISIBILITY
        : DEFAULT_KNOWLEDGE_VISIBILITY;
  const visibility = normalizeVisibility(input.visibility?.length ? input.visibility : defaultVisibility);
  const warnings: string[] = [];

  if (inferredAudience !== "EXTERNAL" && visibility.includes("CHAT")) {
    warnings.push("Internal or restricted knowledge should not be chat-visible unless the user explicitly confirms this boundary.");
  }

  return { audience: inferredAudience, visibility, warnings };
}

export function isExternalChatVisible(input: { audience: KnowledgeAudience; visibility: KnowledgeVisibility[] }) {
  return input.audience === "EXTERNAL" && input.visibility.includes("CHAT");
}

export function buildApprovedChatChunkWhere() {
  return {
    status: "APPROVED" as const,
    document: {
      status: "APPROVED" as const,
      audience: "EXTERNAL" as const,
      visibility: { has: "CHAT" as const },
      collection: {
        audience: "EXTERNAL" as const,
        visibility: { has: "CHAT" as const },
      },
    },
  };
}
