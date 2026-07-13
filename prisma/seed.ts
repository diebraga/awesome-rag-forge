import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { PROJECT_DOCUMENTATION_NAME } from "../lib/project";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const collection = await prisma.ragCollection.upsert({
    where: { id: "rag_collection_sample" },
    update: {
      name: PROJECT_DOCUMENTATION_NAME,
      description: "Sample collection that explains what this project does, for local verification.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "docs"],
    },
    create: {
      id: "rag_collection_sample",
      name: PROJECT_DOCUMENTATION_NAME,
      description: "Sample collection that explains what this project does, for local verification.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "docs"],
    },
  });

  const document = await prisma.ragDocument.upsert({
    where: { id: "rag_document_sample" },
    update: {
      title: "What this project does",
      sourceType: "MARKDOWN",
      category: "documentation",
      domain: "product",
      tags: ["seed", "overview"],
      status: "APPROVED",
      metadata: { purpose: "seed verification" },
    },
    create: {
      id: "rag_document_sample",
      collectionId: collection.id,
      title: "What this project does",
      sourceType: "MARKDOWN",
      category: "documentation",
      domain: "product",
      tags: ["seed", "overview"],
      status: "APPROVED",
      metadata: { purpose: "seed verification" },
    },
  });

  const chunks = [
    {
      id: "rag_chunk_sample",
      chunkIndex: 0,
      sectionTitle: "Overview",
      chunkText:
        "This project is a generic RAG knowledge base builder. Instead of a manual admin panel, you manage the knowledge base by talking to an MCP-connected AI assistant.",
    },
    {
      id: "rag_chunk_sample_2",
      chunkIndex: 1,
      sectionTitle: "How knowledge is added",
      chunkText:
        "The MCP server never writes to the database silently. The assistant first calls a proposal tool that explains the recommended collection, document, chunking plan, and source metadata. Only after you approve does it save anything, and clean knowledge can be saved directly as APPROVED, while ambiguous/problematic knowledge is routed to PENDING_REVIEW with a review reason.",
    },
    {
      id: "rag_chunk_sample_3",
      chunkIndex: 2,
      sectionTitle: "What the MCP server can do",
      chunkText:
        "The MCP server exposes tools to list collections, add new sources, search the knowledge base, approve or reject pending chunks, and create evaluation test cases. The read-only chat cannot perform any of these actions itself.",
    },
  ];

  const createdChunks = [];
  for (const chunk of chunks) {
    const createdChunk = await prisma.ragChunk.upsert({
      where: {
        documentId_chunkIndex: {
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
        },
      },
      update: {
        chunkText: chunk.chunkText,
        sectionTitle: chunk.sectionTitle,
        tokenCount: Math.ceil(chunk.chunkText.split(/\s+/).length * 1.3),
        status: "APPROVED",
        metadata: { seeded: true },
      },
      create: {
        id: chunk.id,
        documentId: document.id,
        chunkText: chunk.chunkText,
        chunkIndex: chunk.chunkIndex,
        sectionTitle: chunk.sectionTitle,
        tokenCount: Math.ceil(chunk.chunkText.split(/\s+/).length * 1.3),
        status: "APPROVED",
        metadata: { seeded: true },
      },
    });
    createdChunks.push(createdChunk);
  }

  await prisma.ragSource.upsert({
    where: { id: "rag_source_sample" },
    update: {
      documentId: document.id,
      chunkId: createdChunks[0].id,
      label: PROJECT_DOCUMENTATION_NAME,
      citationText: "What this project does, Overview",
      sectionTitle: "Overview",
    },
    create: {
      id: "rag_source_sample",
      documentId: document.id,
      chunkId: createdChunks[0].id,
      label: PROJECT_DOCUMENTATION_NAME,
      citationText: "What this project does, Overview",
      sectionTitle: "Overview",
    },
  });

  await prisma.assistantConfig.upsert({
    where: { id: "assistant_config_singleton" },
    update: { name: "Archivist" },
    create: { id: "assistant_config_singleton", name: "Archivist" },
  });

  const defaultHarnessRules: Array<{
    id: string;
    kind: "CAPABILITY" | "RESTRICTION";
    statement: string;
  }> = [
    {
      id: "harness_rule_seed_cap_search",
      kind: "CAPABILITY",
      statement: "Search and answer questions using the approved knowledge base.",
    },
    {
      id: "harness_rule_seed_cap_cite",
      kind: "CAPABILITY",
      statement: "Cite sources for retrieved information when available.",
    },
    {
      id: "harness_rule_seed_restrict_writes",
      kind: "RESTRICTION",
      statement: "Cannot create, edit, approve, reject, archive, or delete knowledge.",
    },
    {
      id: "harness_rule_seed_restrict_identity",
      kind: "RESTRICTION",
      statement: "Cannot reveal the underlying model, provider, or version.",
    },
    {
      id: "harness_rule_seed_restrict_scope",
      kind: "RESTRICTION",
      statement: "Cannot perform any action outside retrieval and answering questions.",
    },
    {
      id: "harness_rule_seed_restrict_structure",
      kind: "RESTRICTION",
      statement:
        "Cannot describe its own internal structure — collection names, categories, tags, or document counts — even if asked directly. Can only answer using retrieved content.",
    },
  ];

  // Superseded by harness_rule_seed_restrict_structure above: an earlier
  // default told the chat it could "explain what the knowledge base
  // contains," which led to it narrating structure/meta-information to end
  // users. Archive it so a re-seed of an existing database doesn't leave a
  // stale, contradictory capability live alongside the new restriction.
  await prisma.harnessRule.upsert({
    where: { id: "harness_rule_seed_cap_explain" },
    update: { status: "ARCHIVED" },
    create: {
      id: "harness_rule_seed_cap_explain",
      kind: "CAPABILITY",
      statement: "Explain what the knowledge base currently contains.",
      status: "ARCHIVED",
    },
  });

  for (const rule of defaultHarnessRules) {
    await prisma.harnessRule.upsert({
      where: { id: rule.id },
      update: {
        kind: rule.kind,
        statement: rule.statement,
        status: "APPROVED",
        reviewer: "seed",
        reviewedAt: new Date(),
      },
      create: {
        id: rule.id,
        kind: rule.kind,
        statement: rule.statement,
        status: "APPROVED",
        reviewer: "seed",
        reviewedAt: new Date(),
      },
    });
  }

  await prisma.ragEvalCase.upsert({
    where: { id: "rag_eval_sample" },
    update: {
      question: "How do I add new knowledge to the knowledge base?",
      expectedAnswer:
        "Ask the assistant to propose adding a source, review the proposal, then approve it. Clean knowledge is saved directly as APPROVED; ambiguous/problematic knowledge is routed to PENDING_REVIEW with a review reason.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "rag"],
    },
    create: {
      id: "rag_eval_sample",
      collectionId: collection.id,
      question: "How do I add new knowledge to the knowledge base?",
      expectedAnswer:
        "Ask the assistant to propose adding a source, review the proposal, then approve it. Clean knowledge is saved directly as APPROVED; ambiguous/problematic knowledge is routed to PENDING_REVIEW with a review reason.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "rag"],
    },
  });
}

main()
  .then(async () => {
    console.log("Seeded RAG sample data.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
