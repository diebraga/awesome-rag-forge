import type { PrismaClient } from "@/generated/prisma/client";
import type { HarnessRuleKind, HarnessRuleScope } from "@/generated/prisma/enums";

/**
 * The harness describes what the read-only chat can and cannot do, on top
 * of (never instead of) the hardcoded identity/read-only rules in
 * lib/rag/chat-context.ts. Those hardcoded rules always win — nothing here
 * can grant a capability the code doesn't already allow.
 *
 * This module holds only shared, capability-neutral logic: validation and
 * data access, used identically by the MCP server (the only writer, via a
 * relative import — see mcp/rag-manager/server.ts) and the chat (the
 * reader), so the rules can't drift between them. It intentionally does
 * NOT contain any chat-facing prompt phrasing — that belongs in
 * lib/rag/chat-context.ts, which is the sole definition of how the test
 * chat talks and what it will and won't say. The MCP server's own
 * "how it talks" — its tool descriptions — lives entirely in
 * mcp/rag-manager/server.ts and must never import chat-context.ts.
 */

export type HarnessRuleInput = {
  kind: HarnessRuleKind;
  statement: string;
  reason?: string;
  scope?: HarnessRuleScope;
};

export type HarnessProposal = {
  kind: HarnessRuleKind;
  statement: string;
  reason?: string;
  scope: HarnessRuleScope;
  warnings: string[];
};

export type HarnessRefusal = {
  refused: true;
  reason: string;
};

// Statements claiming these powers must always be refused for CAPABILITY
// rules — the chat has none of them regardless of what a database row says,
// and letting it claim otherwise would make it lie to end users.
//
// This is a blocklist, which is inherently a losing game against arbitrary
// natural language — it's a fast first-pass filter, not the only defense.
// Cast a wide net of synonyms for each dangerous action rather than the
// single literal verb, since a narrow list is trivially evaded by rephrasing
// ("amend" instead of "edit", "curate on the user's behalf" instead of
// "write"). Word-stem fragments (e.g. "amend" catches "amend"/"amending"/
// "amendment") are used deliberately over exact-word matches for the same
// reason.
const DANGEROUS_CAPABILITY_PATTERNS: RegExp[] = [
  // Write / create / modify a fact or record, under any common phrasing.
  /\b(write|creat|insert|compos)\w*\b/i,
  /\b(edit|modif|updat|amend|revis|alter|adjust|chang|correct|fix|patch|rewrit)\w*\b/i,
  /\bcurat\w*\b/i,
  /\bon (the |a )?user'?s behalf\b/i,
  /\bmanage (the )?knowledge\b/i,
  /\bmaintain(s|ing)?\b.*\bknowledge\b/i,
  // Delete / remove / archive.
  /\b(delet|remov|archiv|eras|wipe|purg|discard)\w*\b/i,
  // Approve / reject / authorize a review decision — but not the bare
  // adjective "approved" ("the approved knowledge base"), which is the
  // normal, safe way to describe already-reviewed content and appears in
  // the seeded legitimate capability text itself. Verb/noun forms
  // (approve/approves/approving/approval) are still caught.
  /\bapprov(?!ed\b)\w*\b/i,
  /\breject(?!ed\b)\w*\b/i,
  /\b(authoriz|sanction)\w*\b/i,
  /\bauto-?approv\w*\b/i,
  /\bself-?approv\w*\b/i,
  /\bgrant(s|ing)?\b.*\baccess\b/i,
  /\bunlock\w*\b/i,
  // Bypass / skip / circumvent review or approval.
  /\bbypass\w*\b/i,
  /\bskip\w*\b.*(review|approval)\b/i,
  /\bcircumvent\w*\b/i,
  /\bsidestep\w*\b/i,
  /\bget(s|ting)? around\b/i,
  /\bwithout (review|approval|oversight|a human|sign-?off)\b/i,
  /\bact(s|ing)? without\b/i,
  // Override / ignore rules or instructions.
  /\b(override|overrid)\w*\b/i,
  /\bignore.*(instruction|rule)s?\b/i,
  // Model/provider disclosure.
  /\breveal.*(model|provider|version)\b/i,
  // Code execution.
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

// CAPABILITY statements are a small, enumerable space — the chat only ever
// does a handful of legitimate things. Rather than relying solely on the
// blocklist above to catch every dangerous phrasing (a losing game), require
// every CAPABILITY statement to also match one of these known-safe,
// read-only verb patterns. A statement that matches neither list is treated
// as suspicious by default (refused) instead of silently allowed through —
// flipping the default from "allow unless blocklisted" to "allow only if
// recognized as safe" for this specific, narrow category.
const SAFE_CAPABILITY_PATTERNS: RegExp[] = [
  /\b(search|find|look ?up|retriev|fetch)\w*\b/i,
  /\b(answer|respond)\w*\b/i,
  /\b(cite|citation)\w*\b/i,
  /\b(summariz|summaris)\w*\b/i,
  /\bexplain\w*\b/i,
  /\b(list|show|display)\w*\b/i,
  /\bdescrib\w*\b/i,
  /\bhelp\w*\b/i,
  /\bassist\w*\b/i,
  /\b(read|view)\w*\b/i,
  /\b(recommend|suggest)\w*\b/i,
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
    const dangerousMatch = DANGEROUS_CAPABILITY_PATTERNS.find((pattern) => pattern.test(statement));
    if (dangerousMatch) {
      return {
        refused: true,
        reason:
          "Refused: this capability statement implies write, delete, approval, bypass, or model-disclosure powers. The chat has none of these regardless of what is configured here, and claiming otherwise would make it lie to end users.",
      };
    }

    // Default-deny for CAPABILITY statements: the blocklist above only
    // catches phrasings we thought to list, which is a losing game against
    // arbitrary language. Since legitimate chat capabilities are a small,
    // enumerable set, require a positive match against known-safe verbs
    // instead of only checking for known-dangerous ones.
    const safeMatch = SAFE_CAPABILITY_PATTERNS.find((pattern) => pattern.test(statement));
    if (!safeMatch) {
      return {
        refused: true,
        reason:
          "Refused: this capability statement doesn't match a recognized read-only action (search, answer, cite, summarize, explain, list, describe, help, assist, read, recommend). Rephrase using one of these, or if this is a restriction instead, propose it with kind: RESTRICTION.",
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
    scope: input.scope ?? "USER_CHAT",
    warnings,
  };
}

type PrismaLike = Pick<PrismaClient, "harnessRule">;

export async function getApprovedHarnessRules(prisma: PrismaLike) {
  const rules = await prisma.harnessRule.findMany({
    where: { status: "APPROVED", scope: { in: ["USER_CHAT", "ALL"] } },
    orderBy: { createdAt: "asc" },
  });

  return {
    capabilities: rules.filter((rule) => rule.kind === "CAPABILITY").map((rule) => rule.statement),
    restrictions: rules.filter((rule) => rule.kind === "RESTRICTION").map((rule) => rule.statement),
    rules: rules.map((rule) => ({ id: rule.id, kind: rule.kind, statement: rule.statement, scope: rule.scope })),
  };
}
