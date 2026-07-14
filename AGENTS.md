<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Portable brain integrations

When moving this brain into another project or database, read `docs/portable-brain.md`, `docs/export-import.md`, and `docs/integrating-with-existing-app.md`. The target must be Postgres with `pgvector`; do not create direct Prisma relations from RAG tables to host app user/account tables.

- KnowledgeScope is context, not auth: use it to label GLOBAL/USER/ORGANIZATION/PROJECT/etc. knowledge with optional external refs, but never add passwords, sessions, memberships, or host-app user relations to the RAG schema.
