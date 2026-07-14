# Prompt: Export A Portable Brain Snapshot

Export this Awesome RAG Forge brain without exposing secrets.

1. Confirm which scope to export: approved only, include pending review, include feedback/review history.
2. Run `npm run brain:export -- --output brain.json` with `--include-pending` and/or `--include-feedback` only when requested.
3. Explain that embeddings are not included and must be rebuilt after import with `npm run rag:embeddings:backfill`.
4. Treat the JSON snapshot as sensitive project knowledge, not as a public artifact.
