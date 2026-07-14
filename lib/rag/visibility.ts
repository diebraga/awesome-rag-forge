export const KNOWLEDGE_AUDIENCES = ["EXTERNAL", "INTERNAL", "RESTRICTED"] as const;
export const KNOWLEDGE_VISIBILITY_SCOPES = ["CHAT", "OPERATOR", "REVIEW", "EVAL"] as const;
export const HARNESS_RULE_SCOPES = ["USER_CHAT", "OPERATOR_AGENT", "MCP_AGENT", "ALL"] as const;
export const KNOWLEDGE_SCOPE_KINDS = ["GLOBAL", "USER", "TEAM", "ORGANIZATION", "PROJECT", "AGENT", "SESSION", "CUSTOM"] as const;
export const GLOBAL_KNOWLEDGE_SCOPE_ID = "knowledge_scope_global";

export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITY_SCOPES)[number];
export type HarnessScope = (typeof HARNESS_RULE_SCOPES)[number];
export type KnowledgeScopeKind = (typeof KNOWLEDGE_SCOPE_KINDS)[number];

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

function normalizeActiveScopeIds(activeScopeIds: string[] = []) {
  return [GLOBAL_KNOWLEDGE_SCOPE_ID, ...activeScopeIds.filter(Boolean).filter((id) => id !== GLOBAL_KNOWLEDGE_SCOPE_ID)];
}

function scopeWhere(activeScopeIds?: string[]) {
  return {
    OR: [{ scopeId: null }, { scopeId: { in: normalizeActiveScopeIds(activeScopeIds) } }],
  };
}

export function buildApprovedChatChunkWhere(activeScopeIds?: string[]) {
  return {
    status: "APPROVED" as const,
    ...scopeWhere(activeScopeIds),
    document: {
      status: "APPROVED" as const,
      audience: "EXTERNAL" as const,
      visibility: { has: "CHAT" as const },
      ...scopeWhere(activeScopeIds),
      collection: {
        audience: "EXTERNAL" as const,
        visibility: { has: "CHAT" as const },
        ...scopeWhere(activeScopeIds),
      },
    },
  };
}
