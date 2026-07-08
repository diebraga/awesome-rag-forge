# Deployment

The current local setup does not directly deploy as-is to Vercel or standard Next.js hosting because it calls:

```text
http://127.0.0.1:11434
```

In local development, that points to the user's Ollama server. In production, it would point to the deployed server container, where Ollama is usually not running.

Deployment options:

1. Next.js on Vercel plus hosted model API.
2. Next.js on Vercel plus a separate GPU model server running Ollama, vLLM, TGI, or similar.
3. One VPS/GPU server running both Next.js and the model server.

For a deployed MVP, the recommended path is:

```text
Next.js app
        ↓
hosted model API or GPU model server
        ↓
Postgres + pgvector RAG database
```

Environment variables:

```text
OLLAMA_URL
OLLAMA_MODEL
```

For a remote model server, `OLLAMA_URL` must be a reachable HTTPS endpoint rather than localhost.
