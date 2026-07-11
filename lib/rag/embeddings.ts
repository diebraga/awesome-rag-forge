export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
export const OLLAMA_EMBED_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

export function parseOllamaEmbeddingResponse(data: unknown): number[] {
  if (!data || typeof data !== "object") throw new Error("Ollama did not return an embedding object.");
  const record = data as { embedding?: unknown; embeddings?: unknown };
  const embedding = Array.isArray(record.embedding)
    ? record.embedding
    : Array.isArray(record.embeddings) && Array.isArray(record.embeddings[0])
      ? record.embeddings[0]
      : null;

  if (!embedding || !embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("Ollama did not return a numeric embedding.");
  }

  return embedding;
}

export function assertEmbeddingDimensions(embedding: number[], dimensions = 768) {
  if (embedding.length !== dimensions) {
    throw new Error(`Expected a ${dimensions}-dimension embedding from ${OLLAMA_EMBED_MODEL}, received ${embedding.length}.`);
  }
}

export function formatPgVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

export async function embedTextWithOllama(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_EMBED_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding request failed (${response.status}). Pull ${OLLAMA_EMBED_MODEL} with: ollama pull ${OLLAMA_EMBED_MODEL}`);
  }

  const embedding = parseOllamaEmbeddingResponse(await response.json());
  assertEmbeddingDimensions(embedding);
  return embedding;
}
