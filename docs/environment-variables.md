# Environment Variables

See `.env.example` for the canonical, always-up-to-date list. Summary:

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | App, MCP server, seed | Postgres connection string for a database with `pgvector` enabled. `.env.example` leaves this empty on purpose and includes a commented local Docker example. Missing, empty, or placeholder values show the database setup UI and block API/MCP use. If the value exists but cannot connect, the UI/API show a database connection error without echoing the secret. |
| `CHAT_PROVIDER` | No (defaults to `ollama`) | Chat API route | Which `ChatProvider` answers the chat (`lib/chat-providers/`). Only `ollama` exists today; the interface exists so a second provider is additive, not a rewrite. |
| `OLLAMA_URL` | No (defaults to `http://127.0.0.1:11434`) | Chat API route | Base URL of the Ollama server. Only read by the `ollama` provider. |
| `OLLAMA_MODEL` | No (defaults to `qwen2.5:7b-instruct`) | Chat API route | Model name to request from Ollama. Only read by the `ollama` provider. |
| `DEVELOPER_MODE` | No (template defaults to `true`) | Assistant instructions | Signals whether repository/source-code/schema/dependency changes are expected. It does not disable normal MCP database operations; see [Operating Modes](operating-modes.md). |
| `ENABLE_TESTING_SURFACE` | No (template defaults to `true`; missing/unset is disabled) | Next.js pages and API routes | Exposes or hides the local testing web surface: chat, collections, harness, feedback, RAG/debug, document download, and Ollama helper routes. Vercel/public deployments stay disabled unless this is explicitly set to `true`; see [Testing Surface](testing-surface.md). |
| `APP_API_KEY` | Optional locally; required for deployed testing surface | Next.js testing API routes | Bearer token for `/api/chat`, `/api/feedback`, `/api/rag*`, and `/api/ollama*` when configured. If `ENABLE_TESTING_SURFACE=true` on Vercel without this key, pages show setup instructions and APIs return `503`. Not used by the default local stdio MCP server. |
| `MCP_HTTP_HOST` | No (defaults to `127.0.0.1`) | `mcp/rag-manager/http.ts` | Bind address for the optional MCP HTTP transport. Only widen this with authentication already in place — see [Security Considerations](security.md#mcp-server-trust-boundary). |
| `MCP_HTTP_PORT` | No (defaults to `3200`) | `mcp/rag-manager/http.ts` | Port for the optional MCP HTTP transport (`npm run mcp:rag-manager:http`). Irrelevant to the default stdio setup. |
| `STORAGE_BUCKET` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Bucket name for original file storage. |
| `STORAGE_ACCESS_KEY_ID` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Access key for the storage provider. |
| `STORAGE_SECRET_ACCESS_KEY` | Only for file uploads | MCP `attach_document_file`, `approve_file_upload`, chat download route | Secret key for the storage provider. |
| `STORAGE_REGION` | No (defaults to `auto`) | `lib/storage.ts` | S3 region. Set for real AWS S3 (e.g. `us-east-1`); `auto` works for R2/most S3-compatible providers. |
| `STORAGE_ENDPOINT` | No | `lib/storage.ts` | Custom S3-compatible endpoint. Leave unset for real AWS S3; set for Cloudflare R2, MinIO, etc. |

## Rules

- Never commit `.env`. It is gitignored via `.env*` in `.gitignore`.
- `DATABASE_URL` is the first required value an AI assistant should ask about during setup. Give the user two choices: paste an existing Postgres URL with `pgvector`, or approve creating a local Postgres database with the included Docker setup. Do not invent remote credentials; only use local-only credentials for a database created on the user's machine after permission.
- `.env.example` must never contain real secrets — only placeholder values or empty strings.
- Storage variables are optional as a set: either configure `STORAGE_BUCKET`/`STORAGE_ACCESS_KEY_ID`/`STORAGE_SECRET_ACCESS_KEY`, or configure none. Without them, MCP PDF uploads still extract selectable text, fall back to OCR for scanned pages, sanitize the text, and save RAG chunks; only original-file storage/download is skipped. `STORAGE_REGION`/`STORAGE_ENDPOINT` are optional refinements on top of those three, not part of the required set.
- For a remote/deployed model server, `OLLAMA_URL` must be a reachable HTTPS endpoint, not `localhost`.
- `ENABLE_TESTING_SURFACE` is intentionally not inferred from `NODE_ENV`. `.env.example` sets it to `true` for local clones, but missing/unset means disabled, including on Vercel. Set it to exactly `true` in each environment where you intentionally want the web testing surface exposed.
- If a deployed environment intentionally sets `ENABLE_TESTING_SURFACE=true`, also set a strong `APP_API_KEY`. Locally, leaving `APP_API_KEY` blank keeps the setup frictionless; if you do set it, the browser UI will ask for it once and store it in localStorage.
- Do not ask for or invent an MCP API key for the default setup. The stdio MCP server is local/offline and relies on the user having local database access. Only the optional web testing API uses `APP_API_KEY`.
