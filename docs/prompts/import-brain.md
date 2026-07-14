# Prompt: Import A Portable Brain Snapshot

Import an Awesome RAG Forge portable brain snapshot into a target Postgres database.

1. Verify the target is Postgres with `pgvector`; this is not MongoDB/SQLite/MySQL compatible without code changes.
2. Configure `DATABASE_URL` for the target and run `npx prisma db push` first.
3. Run `npm run brain:import -- --file brain.json` as a dry run.
4. Summarize incoming, existing, and insertable rows for the user.
5. Apply only after confirmation: `npm run brain:import -- --file brain.json --apply --mode skip`.
6. Run `npm run rag:embeddings:backfill` after import.
7. Never add direct Prisma relations from RAG tables to host app user/account tables during import.
