# Environment Variables

See `.env.example` for the canonical, always-up-to-date list. Summary:

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | App, MCP server, seed | Postgres connection string (any Postgres-compatible provider). |
| `CHAT_PROVIDER` | No (defaults to `ollama`) | Chat API route | Which `ChatProvider` answers the chat (`lib/chat-providers/`). Only `ollama` exists today; the interface exists so a second provider is additive, not a rewrite. |
| `OLLAMA_URL` | No (defaults to `http://127.0.0.1:11434`) | Chat API route | Base URL of the Ollama server. Only read by the `ollama` provider. |
| `OLLAMA_MODEL` | No (defaults to `qwen2.5:7b-instruct`) | Chat API route | Model name to request from Ollama. Only read by the `ollama` provider. |
| `DEVELOPER_MODE` | No (template defaults to `true`) | Assistant instructions | Signals whether repository/source-code/schema/dependency changes are expected. It does not disable normal MCP database operations; see [Operating Modes](operating-modes.md). |
| `ENABLE_TESTING_SURFACE` | No (defaults to disabled unless exactly `true`) | Next.js pages and API routes | Exposes or hides the local testing web surface: chat, collections, harness, feedback, RAG/debug, document download, and Ollama helper routes. Keep false for deployed/public instances until auth exists; see [Testing Surface](testing-surface.md). |
| `MCP_HTTP_HOST` | No (defaults to `127.0.0.1`) | `mcp/rag-manager/http.ts` | Bind address for the optional MCP HTTP transport. Only widen this with authentication already in place — see [Security Considerations](security.md#mcp-server-trust-boundary). |
| `MCP_HTTP_PORT` | No (defaults to `3200`) | `mcp/rag-manager/http.ts` | Port for the optional MCP HTTP transport (`npm run mcp:rag-manager:http`). Irrelevant to the default stdio setup. |
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
- `ENABLE_TESTING_SURFACE` is intentionally not inferred from `NODE_ENV`. Missing/unset means disabled, including on Vercel. Set it to exactly `true` only when you intentionally want the web testing surface exposed.
