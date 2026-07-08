# Roadmap

Current completed work:

- Cloned the `diebraga/legal-bot` repository.
- Replaced the default Next.js starter page with a centered legal chat UI.
- Installed and initialized shadcn UI.
- Added shadcn components for the chat shell.
- Installed `qwen2.5:7b-instruct` locally through Ollama.
- Added a Next.js API route that calls Ollama.
- Connected the frontend chat to the local model.
- Verified lint, build, direct API call, and browser chat.

Next likely steps:

1. Add environment examples for `OLLAMA_URL` and `OLLAMA_MODEL`.
2. Improve chat rendering with Markdown support.
3. Add a RAG ingestion script.
4. Set up Supabase Postgres with pgvector.
5. Add document upload and chunking.
6. Add `search_rag` as the first real harness tool.
7. Add source-linked responses.
8. Add feedback capture for continuous learning.
9. Add lawyer-review escalation records.
10. Decide deployment path for the model server.
