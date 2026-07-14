# Prompt: Integrate The Brain With A Host App

Design the integration so the host app owns identity and Awesome RAG Forge owns knowledge.

1. Keep RAG tables and MCP write paths unchanged unless the user explicitly wants to fork the contract.
2. Represent host app users, workspaces, organizations, or projects as metadata/scope refs such as `scopeKind` and `scopeExternalRef`.
3. Add retrieval filters around those refs in the host app boundary, not foreign-key requirements inside `RagDocument` or `RagChunk`.
4. Document any custom metadata keys before writing them.
5. If the user asks for hard database-level user ownership, warn that this requires schema and MCP changes across all write paths.
