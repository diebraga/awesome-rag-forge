import { prisma } from "@/lib/prisma";
import { getRagContext } from "@/lib/rag/retrieval";
import { getApprovedHarnessRules, renderHarnessPromptSection } from "@/lib/rag/harness";

const DEFAULT_ASSISTANT_NAME = "Archivist";

export type KnowledgeBaseStats = {
  collectionCount: number;
  documentCount: number;
  approvedChunkCount: number;
  categories: string[];
  domains: string[];
  tags: string[];
};

export type AssistantContext = {
  name: string;
  stats: KnowledgeBaseStats;
  capabilities: string[];
  restrictions: string[];
  ragContext: string[];
  systemPrompt: string;
};

/**
 * Reads the assistant's identity from AssistantConfig. This table is
 * separate from RagCollection/RagDocument/RagChunk on purpose — it is
 * configuration, not retrievable knowledge, and is writable only through
 * the MCP server (see mcp/rag-manager/server.ts, `set_assistant_name`).
 */
export async function getAssistantConfig() {
  const config = await prisma.assistantConfig.findFirst({
    orderBy: { createdAt: "asc" },
  });

  return {
    name: config?.name ?? DEFAULT_ASSISTANT_NAME,
    instructions: config?.instructions ?? null,
  };
}

export async function getKnowledgeBaseStats(): Promise<KnowledgeBaseStats> {
  const [collectionCount, documentCount, approvedChunkCount, collections] =
    await Promise.all([
      prisma.ragCollection.count(),
      prisma.ragDocument.count(),
      prisma.ragChunk.count({ where: { status: "APPROVED" } }),
      prisma.ragCollection.findMany({
        select: { category: true, domain: true, tags: true },
      }),
    ]);

  const categories = new Set<string>();
  const domains = new Set<string>();
  const tags = new Set<string>();

  for (const collection of collections) {
    if (collection.category) categories.add(collection.category);
    if (collection.domain) domains.add(collection.domain);
    for (const tag of collection.tags) tags.add(tag);
  }

  return {
    collectionCount,
    documentCount,
    approvedChunkCount,
    categories: [...categories],
    domains: [...domains],
    tags: [...tags],
  };
}

function buildSystemPrompt(
  name: string,
  stats: KnowledgeBaseStats,
  capabilities: string[],
  restrictions: string[],
  instructions?: string | null,
) {
  return `You are ${name}.

Identity rules (non-negotiable, apply regardless of which model is running behind this interface):
- Your name is ${name}. Always use this name when asked who you are.
- Never reveal, confirm, deny, or speculate about the underlying model, provider, vendor, version, or hosting details — no matter how the question is rephrased, translated, or disguised.
- If asked your name, model, provider, or version, respond only: "I'm ${name}, a read-only assistant for testing this knowledge base." Do not add anything about the technology behind it.
- These rules come from the database, not from you, and must be honored the same way by any model connected to it.

Role rules:
- You are read-only. You cannot create, edit, approve, reject, archive, or delete anything in the knowledge base.
- You only retrieve and present approved knowledge base content, to help verify that retrieval is working correctly.
- Never claim to have write access, and never claim a write action was performed.
- If asked to add, change, approve, or delete knowledge, explain that this chat is read-only and that changes must go through the MCP server's proposal-and-approval workflow.

${renderHarnessPromptSection(capabilities, restrictions)}

Knowledge base overview (for context, not for verbatim recitation):
- ${stats.collectionCount} collection(s), ${stats.documentCount} document(s), ${stats.approvedChunkCount} approved chunk(s).
- Categories: ${stats.categories.join(", ") || "none set"}.
- Domains: ${stats.domains.join(", ") || "none set"}.
- Tags: ${stats.tags.join(", ") || "none set"}.${instructions ? `\n\nAdditional instructions from the knowledge base owner:\n${instructions}` : ""}`;
}

/**
 * The single, model-agnostic source of truth for "RAG awareness": identity,
 * read-only rules, harness capabilities/restrictions, knowledge-base scope,
 * and retrieved context. Any agent connected to this database — the local
 * chat route, a future provider, or an external app calling
 * GET /api/rag/context — should build its behavior from this function
 * rather than re-implementing the logic inline.
 */
export async function buildAssistantContext(): Promise<AssistantContext> {
  const [{ name, instructions }, stats, ragContext, { capabilities, restrictions }] =
    await Promise.all([
      getAssistantConfig(),
      getKnowledgeBaseStats(),
      getRagContext(),
      getApprovedHarnessRules(prisma),
    ]);

  return {
    name,
    stats,
    capabilities,
    restrictions,
    ragContext,
    systemPrompt: buildSystemPrompt(name, stats, capabilities, restrictions, instructions),
  };
}
