import { embedTextWithOllama, formatPgVectorLiteral } from "../../lib/rag/embeddings";
import { getRetrievalAliases, retrievalTextForEmbedding } from "./retrieval-enrichment";

type RawClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

export async function buildChunkEmbeddingInput(chunkText: string, metadata: unknown) {
  return retrievalTextForEmbedding(chunkText, getRetrievalAliases(metadata));
}

export async function embedChunkForApproval(input: { chunkText: string; metadata: unknown }) {
  return embedTextWithOllama(await buildChunkEmbeddingInput(input.chunkText, input.metadata));
}

export async function storeChunkEmbedding(client: RawClient, chunkId: string, embedding: number[]) {
  await client.$executeRawUnsafe(
    'UPDATE "RagChunk" SET "embedding" = $1::vector WHERE "id" = $2',
    formatPgVectorLiteral(embedding),
    chunkId,
  );
}
