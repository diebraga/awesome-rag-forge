# Project Overview

**awesome-rag-forge** is a generic RAG (retrieval-augmented generation) knowledge base builder. Instead of a manual admin panel, you build, organize, and review your knowledge base by talking to an AI assistant connected through an MCP (Model Context Protocol) server.

## Core idea

1. You chat with an MCP-connected assistant (Claude Desktop, Codex, or any MCP client).
2. The assistant inspects the current knowledge base through MCP tools.
3. The assistant proposes where new knowledge should go: which collection, what chunking plan, what metadata.
4. You approve or reject the proposal.
5. Only after approval does the assistant write to the database, and new knowledge always starts as `PENDING_REVIEW`.
6. A separate chat UI (the Next.js app) answers user questions using only `APPROVED` knowledge.

This project is intentionally domain-agnostic. The database schema uses generic fields (`category`, `domain`, `tags`, `metadata`) instead of any single vertical's vocabulary, so you can use it for product docs, internal wikis, support knowledge bases, research notes, or anything else.

## Two components, two responsibilities

This project draws a hard line between reading the knowledge base and managing it. Each side has exactly one job:

- **Chat application (`app/`)** — a **read-only** viewer. Its only purpose is to search and answer questions using the `APPROVED` knowledge base, so you can test retrieval quality and see what the knowledge base currently contains. It has no code path that creates, edits, approves, rejects, archives, or deletes anything. It cannot write to the database, full stop.
- **MCP server (`mcp/rag-manager`)** — the **only** component authorized to manage the knowledge base and the chat's own behavioral rules (its "harness"). All creation, editing, approval, rejection, archiving, review, feedback, eval-case, and harness-rule management happens here, gated by a propose-then-approve workflow (see [MCP Server](mcp-server.md)).

If you ever find yourself wiring a write operation into `app/`, that's a sign it belongs in the MCP server instead. See [System Architecture](architecture.md) for the enforced boundary.

## What's included

- A read-only Next.js chat app that answers questions using a local model (via Ollama) plus approved RAG context — a retrieval viewer, not an admin panel.
- A Prisma schema modeling collections, documents, chunks, sources, reviews, feedback, eval cases, assistant identity, and harness rules.
- An isolated MCP server (`mcp/rag-manager`) that manages the knowledge base and the chat's harness (its configurable capabilities/restrictions) with a human-in-the-loop write path.
- A seed script that documents the project itself, so you have working data to query immediately.

## What's not included (yet)

- Authentication, billing, or multi-tenant access control.
- External embedding providers or hosted vector databases; local semantic retrieval uses Ollama + pgvector.
- File parsing (PDF/DOCX extraction) — pass already-extracted text into the MCP tools.
- Automatic deployment of the MCP server (see [Deployment](deployment.md)).

## Where to go next

- [Repository Structure](repository-structure.md)
- [System Architecture](architecture.md)
- [MCP Server](mcp-server.md)
- [Development Workflow](development-workflow.md)
