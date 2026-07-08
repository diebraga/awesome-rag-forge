CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx"
  ON "RagChunk"
  USING hnsw ("embedding" vector_cosine_ops);
