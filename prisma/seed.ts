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
      name: "Legal Bot MVP",
      description: "Sample RAG collection for local verification.",
      matterType: "general",
      jurisdiction: "US",
    },
    create: {
      id: "rag_collection_sample",
      name: "Legal Bot MVP",
      description: "Sample RAG collection for local verification.",
      matterType: "general",
      jurisdiction: "US",
    },
  });

  const document = await prisma.ragDocument.upsert({
    where: { id: "rag_document_sample" },
    update: {
      title: "Legal Bot Verification Memo",
      sourceType: "MEMO",
      jurisdiction: "US",
      matterType: "general",
      status: "APPROVED",
      metadata: { purpose: "seed verification" },
    },
    create: {
      id: "rag_document_sample",
      collectionId: collection.id,
      title: "Legal Bot Verification Memo",
      sourceType: "MEMO",
      jurisdiction: "US",
      matterType: "general",
      status: "APPROVED",
      metadata: { purpose: "seed verification" },
    },
  });

  const chunk = await prisma.ragChunk.upsert({
    where: {
      documentId_chunkIndex: {
        documentId: document.id,
        chunkIndex: 0,
      },
    },
    update: {
      chunkText:
        "Legal Bot stores approved knowledge chunks in Prisma Postgres and reads them as RAG context.",
      sectionTitle: "Seeded RAG context",
      tokenCount: 14,
      status: "APPROVED",
      metadata: { seeded: true },
    },
    create: {
      id: "rag_chunk_sample",
      documentId: document.id,
      chunkText:
        "Legal Bot stores approved knowledge chunks in Prisma Postgres and reads them as RAG context.",
      chunkIndex: 0,
      sectionTitle: "Seeded RAG context",
      tokenCount: 14,
      status: "APPROVED",
      metadata: { seeded: true },
    },
  });

  await prisma.ragSource.upsert({
    where: { id: "rag_source_sample" },
    update: {
      documentId: document.id,
      chunkId: chunk.id,
      label: "Seed memo",
      citationText: "Legal Bot Verification Memo, Seeded RAG context",
      sectionTitle: "Seeded RAG context",
    },
    create: {
      id: "rag_source_sample",
      documentId: document.id,
      chunkId: chunk.id,
      label: "Seed memo",
      citationText: "Legal Bot Verification Memo, Seeded RAG context",
      sectionTitle: "Seeded RAG context",
    },
  });

  await prisma.ragEvalCase.upsert({
    where: { id: "rag_eval_sample" },
    update: {
      question: "Where does Legal Bot store approved knowledge chunks?",
      expectedAnswer: "In Prisma Postgres RAG chunk records.",
      matterType: "general",
      jurisdiction: "US",
      tags: ["seed", "rag"],
    },
    create: {
      id: "rag_eval_sample",
      collectionId: collection.id,
      question: "Where does Legal Bot store approved knowledge chunks?",
      expectedAnswer: "In Prisma Postgres RAG chunk records.",
      matterType: "general",
      jurisdiction: "US",
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
