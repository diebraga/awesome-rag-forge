# Post-Install Handoff

When an AI assistant finishes setting up this repository for a user, it must end with a short handoff that explains what is ready and what each surface is for. Do this after dependency install, database setup/checks, Prisma setup, local server start, and any MCP client registration attempt.

## Required final message

Use this shape and fill in the status values honestly:

```text
Setup is complete.

Local app: <URL or not started>
Database: <connected / missing / connection failed>
Testing UI: <enabled / disabled / blocked by missing API key>
Chat provider: <Ollama ready / Ollama missing / hosted provider configured / hosted provider needs API key>
MCP: <registered / not registered / requires a new client session>

The browser UI is the local testing surface. You can chat with approved RAG knowledge, browse approved collections, archive visible approved collection documents/chunks after confirmation, view approved harness rules, submit answer feedback, download approved stored documents, choose a local/hosted chat provider, and use local Ollama setup helpers.

The MCP server is the local tool server your AI assistant uses to manage the knowledge base. Through MCP, I can propose new knowledge, ingest PDFs/text, organize collections, review feedback, create eval cases, manage harness rules, and archive or correct knowledge after your approval.

The browser UI is not MCP-connected. If MCP was just registered, start a new session in your MCP-capable client before expecting the tools to appear.
```

## What to make clear

- Missing Postgres or `pgvector` is a setup blocker. Offer the user either an existing Postgres `DATABASE_URL` or the local Docker Postgres path.
- Installing Node.js, Docker Desktop, native Postgres, Ollama, or an MCP client requires user permission first. The local UI can attempt Ollama installation only after the user clicks the install action and only outside production/local-only guards.
- Bucket credentials are optional. Without them, PDF/text ingestion can still save extracted text; original-file downloads need storage configuration.
- The web testing UI is read-only except for narrow answer feedback. It must not be described as an admin panel or MCP client.
- MCP Operator Mode can write to the application database through supported tools. It cannot edit repository files unless the user explicitly enters Developer Mode.
- Destructive or high-impact MCP actions, such as archiving documents, changing approved knowledge, deleting stored files, or changing harness behavior, require explicit user confirmation.
