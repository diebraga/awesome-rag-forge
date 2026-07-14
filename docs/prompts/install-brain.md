# Prompt: Install Awesome RAG Forge Brain In A Project

You are installing Awesome RAG Forge as a local, portable RAG brain.

1. Verify Node.js >= 20.9, npm, and Postgres with `pgvector`.
2. If `DATABASE_URL` is missing, ask the user whether to configure an existing Postgres URL through `npm run setup` or approve creating local Docker Postgres. Do not ask them to paste secrets into chat.
3. Run `npm install`, configure `.env`, `npx prisma generate`, `npx prisma db push`, and `npm run db:seed`.
4. Start `npm run dev` and open the local UI.
5. Register the MCP server with the user's MCP client and tell them a new client session is required before tools appear.
6. Do not create relationships from RAG tables to host app user/account tables.
