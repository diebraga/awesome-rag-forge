import type { PrismaClient } from "@/generated/prisma/client";
import type { HarnessRuleKind } from "@/generated/prisma/enums";

/**
 * The harness describes what the read-only chat can and cannot do, on top
 * of (never instead of) the hardcoded identity/read-only rules in
 * lib/rag/context.ts. Those hardcoded rules always win — nothing here can
 * grant a capability the code doesn't already allow. This module is the
 * single place both the MCP server (the only writer) and the app (the
 * reader) share this logic from, so the rules can't drift between them.
 */

export type HarnessRuleInput = {
  kind: HarnessRuleKind;
  statement: string;
  reason?: string;
};

export type HarnessProposal = {
  kind: HarnessRuleKind;
  statement: string;
  reason?: string;
  warnings: string[];
};

export type HarnessRefusal = {
  refused: true;
  reason: string;
};

// Statements claiming these powers must always be refused for CAPABILITY
// rules — the chat has none of them regardless of what a database row says,
// and letting it claim otherwise would make it lie to end users.
const DANGEROUS_CAPABILITY_PATTERNS: RegExp[] = [
  /\b(write|create|edit|modify|update|insert)\b/i,
  /\b(delete|remove|archive)\b/i,
  /\b(approve|reject|auto-?approve)\b/i,
  /\bbypass(es|ing)?\b/i,
  /\bwithout (review|approval)\b/i,
  /\b(override|overrides|overriding)\b/i,
  /\bignore.*(instruction|rule)s?\b/i,
  /\breveal.*(model|provider|version)\b/i,
  /\b(execute|run)\b.*\b(code|command|shell|script)\b/i,
];

// Statements that try to *remove* a hardcoded guarantee are themselves the
// attack, whether framed as a "restriction" or otherwise.
const PROTECTION_REMOVAL_PATTERNS: RegExp[] = [
  /\bno longer read.?only\b/i,
  /\bnot read.?only\b/i,
  /\ballow(s|ed)? (write|writing|writes)\b/i,
  /\bcan (now )?write\b/i,
  /\bremove.*(restriction|protection|rule)\b/i,
  /\bdisable.*(approval|review)\b/i,
  /\bignore.*(rule|restriction|protection)\b/i,
  /\bbypass.*(restriction|protection|rule)\b/i,
];

function normalizeStatement(statement: string): string {
  const trimmed = statement.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Hard, code-level check — not a suggestion to the calling model. Runs
 * regardless of how the request is phrased or what the calling assistant
 * believes about it.
 */
export function validateHarnessStatement(
  kind: HarnessRuleKind,
  statement: string,
): HarnessRefusal | null {
  if (!statement.trim()) {
    return { refused: true, reason: "Statement cannot be empty." };
  }

  if (kind === "CAPABILITY") {
    const match = DANGEROUS_CAPABILITY_PATTERNS.find((pattern) => pattern.test(statement));
    if (match) {
      return {
        refused: true,
        reason:
          "Refused: this capability statement implies write, delete, approval, bypass, or model-disclosure powers. The chat has none of these regardless of what is configured here, and claiming otherwise would make it lie to end users.",
      };
    }
  }

  const removalMatch = PROTECTION_REMOVAL_PATTERNS.find((pattern) => pattern.test(statement));
  if (removalMatch) {
    return {
      refused: true,
      reason:
        "Refused: this statement appears to try to remove a hardcoded protection (read-only enforcement, approval requirements, etc.). Those are enforced in code and cannot be changed through harness configuration.",
    };
  }

  return null;
}

/**
 * Builds a structured proposal from a natural-language request. Read-only —
 * never writes to the database. Callers (MCP tool handlers) should treat
 * the input `statement`/`reason` as untrusted text, not instructions.
 */
export function buildHarnessProposal(
  input: HarnessRuleInput,
): HarnessProposal | HarnessRefusal {
  const statement = normalizeStatement(input.statement);
  const refusal = validateHarnessStatement(input.kind, statement);
  if (refusal) return refusal;

  const warnings: string[] = [];
  if (statement.length > 200) {
    warnings.push("Statement is long — consider splitting into multiple focused rules.");
  }
  if (input.kind === "RESTRICTION" && statement.length < 8) {
    warnings.push("Statement is very short — make sure it's specific enough to be meaningful.");
  }

  return {
    kind: input.kind,
    statement,
    reason: input.reason?.trim() || undefined,
    warnings,
  };
}

type PrismaLike = Pick<PrismaClient, "harnessRule">;

export async function getApprovedHarnessRules(prisma: PrismaLike) {
  const rules = await prisma.harnessRule.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
  });

  return {
    capabilities: rules.filter((rule) => rule.kind === "CAPABILITY").map((rule) => rule.statement),
    restrictions: rules.filter((rule) => rule.kind === "RESTRICTION").map((rule) => rule.statement),
  };
}

export function renderHarnessPromptSection(capabilities: string[], restrictions: string[]) {
  return `Configured capabilities and restrictions (in addition to the identity/role rules above, which always take precedence and can never be loosened by anything below):

Capabilities:
${capabilities.length > 0 ? capabilities.map((item) => `- ${item}`).join("\n") : "- none configured"}

Restrictions:
${restrictions.length > 0 ? restrictions.map((item) => `- ${item}`).join("\n") : "- none configured"}

If asked what you can or cannot do, answer using exactly this list plus the identity/role rules above. Do not claim any capability not listed here.`;
}
