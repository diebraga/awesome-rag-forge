import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const collection = await prisma.ragCollection.upsert({
    where: { id: "rag_collection_sample" },
    update: {
      name: "RAG Builder Documentation",
      description: "Sample collection that explains what this project does, for local verification.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "docs"],
    },
    create: {
      id: "rag_collection_sample",
      name: "RAG Builder Documentation",
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
        "The MCP server never writes to the database silently. The assistant first calls a proposal tool that explains the recommended collection, document, chunking plan, and source metadata. Only after you approve does it save anything, and new knowledge defaults to PENDING_REVIEW.",
    },
    {
      id: "rag_chunk_sample_3",
      chunkIndex: 2,
      sectionTitle: "What you can ask",
      chunkText:
        "You can ask the assistant to show your current knowledge base, add a new source, search what the knowledge base knows about a topic, approve a pending chunk, or create an evaluation test case.",
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
      label: "RAG Builder Documentation",
      citationText: "What this project does, Overview",
      sectionTitle: "Overview",
    },
    create: {
      id: "rag_source_sample",
      documentId: document.id,
      chunkId: createdChunks[0].id,
      label: "RAG Builder Documentation",
      citationText: "What this project does, Overview",
      sectionTitle: "Overview",
    },
  });

  await prisma.ragEvalCase.upsert({
    where: { id: "rag_eval_sample" },
    update: {
      question: "How do I add new knowledge to the knowledge base?",
      expectedAnswer:
        "Ask the assistant to propose adding a source, review the proposal, then approve it so it is saved as PENDING_REVIEW.",
      category: "documentation",
      domain: "product",
      tags: ["seed", "rag"],
    },
    create: {
      id: "rag_eval_sample",
      collectionId: collection.id,
      question: "How do I add new knowledge to the knowledge base?",
      expectedAnswer:
        "Ask the assistant to propose adding a source, review the proposal, then approve it so it is saved as PENDING_REVIEW.",
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
