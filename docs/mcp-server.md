# MCP Server

The MCP server lives at `mcp/rag-manager/` and manages the RAG knowledge base through Prisma. It is the only supported write path into the database — the Next.js app never writes knowledge, only reads `APPROVED` chunks.

## Running it locally

```bash
npm run mcp:rag-manager
```

This starts the server on stdio transport, which is how local MCP clients (Claude Desktop, Codex CLI, etc.) expect to talk to it.

## Tools

| Tool | Writes to DB? | Purpose |
| --- | --- | --- |
| `list_collections` | No | List existing collections. |
| `create_collection` | Yes | Create a new collection directly. |
| `list_documents` | No | List documents, optionally filtered. |
| `search_knowledge_base` | No | Text search over chunks. |
| `propose_source_insert` | **No** | Analyze source text and propose collection/document/chunk plan. |
| `approve_source_insert` | Yes (if approved) | Persist a proposal, but only when `userApproval: true`. |
| `attach_document_file` | Yes (if storage configured) | Record a `storageKey` for an original file; refuses if storage env vars are missing. |
| `list_pending_reviews` | No | List documents/chunks awaiting review. |
| `approve_chunk` | Yes | Mark a chunk `APPROVED` and log a review. |
| `reject_chunk` | Yes | Mark a chunk `REJECTED` and log a review. |
| `add_feedback` | Yes | Record feedback on an answer or chunk. |
| `create_eval_case` | Yes | Record a test question for future evaluation. |

## The safety rule

**The assistant must call `propose_source_insert` before writing anything new.** It must show the proposal to the user and ask an explicit approval question before calling `approve_source_insert` with `userApproval: true`. New knowledge always starts as `PENDING_REVIEW` — nothing skips human review to become `APPROVED`.

A proposal includes:

- the recommended collection (existing or new)
- the document title and source type
- category / domain / tags
- the chunking plan
- source/citation metadata
- an explicit list of warnings (e.g. "no category or domain was provided")

## Document attachments require storage configuration

`attach_document_file` calls `isStorageConfigured()` from `lib/storage.ts`, which checks for `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY`. If any are missing, the tool returns:

> Document storage is not configured. Add bucket/storage environment variables before uploading files.

instead of silently storing anything. It is fine to store extracted text in the database without storage configured — only original file bytes require it. This repo does not include a bucket client implementation; wire one into `lib/storage.ts` for your provider of choice (S3, R2, GCS, etc.) before enabling uploads.

## Connecting to Claude Desktop or Codex

Add an entry pointing at this repo's checkout, for example (Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rag-manager": {
      "command": "npm",
      "args": ["run", "mcp:rag-manager"],
      "cwd": "/absolute/path/to/your/local/clone/talk-to-rag-mcp"
    }
  }
}
```

`cwd` **must** point at your local clone — the MCP server is not hosted anywhere. See [Deployment](deployment.md) for why the deployed app and the MCP server are separate things.

## Example prompts

- "Show me my current knowledge base."
- "Add this source to the knowledge base." (paste text)
- "Search what we know about onboarding."
- "Approve this pending chunk."
- "Create an eval case for [question]."
