import "dotenv/config";
import { prisma, disconnectPrisma } from "../mcp/rag-manager/prisma";
import { embedChunkForApproval, storeChunkEmbedding } from "../lib/rag/chunk-embeddings";

async function main() {
  const chunks = await prisma.ragChunk.findMany({
    where: {
      status: "APPROVED",
      document: { status: "APPROVED" },
    },
    select: {
      id: true,
      chunkText: true,
      metadata: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  let updated = 0;
  for (const chunk of chunks) {
    const embedding = await embedChunkForApproval(chunk);
    await storeChunkEmbedding(prisma, chunk.id, embedding);
    updated += 1;
    console.error(`embedded ${updated}/${chunks.length}: ${chunk.id}`);
  }

  console.log(JSON.stringify({ ok: true, updated }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
