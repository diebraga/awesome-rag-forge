# Project Overview

**talk-to-rag-mcp** is a generic RAG (retrieval-augmented generation) knowledge base builder. Instead of a manual admin panel, you build, organize, and review your knowledge base by talking to an AI assistant connected through an MCP (Model Context Protocol) server.

## Core idea

1. You chat with an MCP-connected assistant (Claude Desktop, Codex, or any MCP client).
2. The assistant inspects the current knowledge base through MCP tools.
3. The assistant proposes where new knowledge should go: which collection, what chunking plan, what metadata.
4. You approve or reject the proposal.
5. Only after approval does the assistant write to the database, and new knowledge always starts as `PENDING_REVIEW`.
6. A separate chat UI (the Next.js app) answers user questions using only `APPROVED` knowledge.

This project is intentionally domain-agnostic. The database schema uses generic fields (`category`, `domain`, `tags`, `metadata`) instead of any single vertical's vocabulary, so you can use it for product docs, internal wikis, support knowledge bases, research notes, or anything else.

## What's included

- A Next.js chat app that answers questions using a local model (via Ollama) plus approved RAG context.
- A Prisma schema modeling collections, documents, chunks, sources, reviews, feedback, and eval cases.
- An isolated MCP server (`mcp/rag-manager`) that manages the knowledge base with a human-in-the-loop write path.
- A seed script that documents the project itself, so you have working data to query immediately.

## What's not included (yet)

- Authentication, billing, or multi-tenant access control.
- Real embeddings/vector search (the schema has an `embedding` column reserved for this; MVP retrieval is text search).
- File parsing (PDF/DOCX extraction) — pass already-extracted text into the MCP tools.
- Automatic deployment of the MCP server (see [Deployment](deployment.md)).

## Where to go next

- [Repository Structure](repository-structure.md)
- [System Architecture](architecture.md)
- [MCP Server](mcp-server.md)
- [Development Workflow](development-workflow.md)
