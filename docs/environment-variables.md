# Environment Variables

See `.env.example` for the canonical, always-up-to-date list. Summary:

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | App, MCP server, seed | Postgres connection string (any Postgres-compatible provider). |
| `OLLAMA_URL` | No (defaults to `http://127.0.0.1:11434`) | Chat API route | Base URL of the Ollama server. |
| `OLLAMA_MODEL` | No (defaults to `qwen2.5:7b-instruct`) | Chat API route | Model name to request from Ollama. |
| `STORAGE_BUCKET` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Bucket name for original file storage. |
| `STORAGE_ACCESS_KEY_ID` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Access key for the storage provider. |
| `STORAGE_SECRET_ACCESS_KEY` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Secret key for the storage provider. |
| `STORAGE_REGION` | No (defaults to `auto`) | `lib/storage.ts` | S3 region. Set for real AWS S3 (e.g. `us-east-1`); `auto` works for R2/most S3-compatible providers. |
| `STORAGE_ENDPOINT` | No | `lib/storage.ts` | Custom S3-compatible endpoint. Leave unset for real AWS S3; set for Cloudflare R2, MinIO, etc. |

## Rules

- Never commit `.env`. It is gitignored via `.env*` in `.gitignore`.
- `.env.example` must never contain real secrets — only placeholder values or empty strings.
- Storage variables are optional as a set: either configure `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY`, or configure none. `lib/storage.ts` treats a partially-configured set the same as unconfigured and refuses to attach or upload files. `STORAGE_REGION`/`STORAGE_ENDPOINT` are optional refinements on top of those three, not part of the required set.
- For a remote/deployed model server, `OLLAMA_URL` must be a reachable HTTPS endpoint, not `localhost`.
