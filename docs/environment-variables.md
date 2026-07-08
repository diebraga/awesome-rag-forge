# Environment Variables

See `.env.example` for the canonical, always-up-to-date list. Summary:

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | App, MCP server, seed | Postgres connection string (any Postgres-compatible provider). |
| `OLLAMA_URL` | No (defaults to `http://127.0.0.1:11434`) | Chat API route | Base URL of the Ollama server. |
| `OLLAMA_MODEL` | No (defaults to `qwen2.5:7b-instruct`) | Chat API route | Model name to request from Ollama. |
| `STORAGE_BUCKET` | Only for file uploads | MCP `attach_document_file` | Bucket name for original file storage. |
| `STORAGE_ACCESS_KEY_ID` | Only for file uploads | MCP `attach_document_file` | Access key for the storage provider. |
| `STORAGE_SECRET_ACCESS_KEY` | Only for file uploads | MCP `attach_document_file` | Secret key for the storage provider. |

## Rules

- Never commit `.env`. It is gitignored via `.env*` in `.gitignore`.
- `.env.example` must never contain real secrets — only placeholder values or empty strings.
- Storage variables are optional as a set: either configure all three, or configure none. `lib/storage.ts` treats a partially-configured set the same as unconfigured and refuses to attach files.
- For a remote/deployed model server, `OLLAMA_URL` must be a reachable HTTPS endpoint, not `localhost`.
