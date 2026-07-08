# RAG Plan

RAG is not implemented yet.

The intended MVP RAG stack is:

```text
Supabase Postgres + pgvector
```

The source documents can begin as Markdown, PDFs, legal memos, checklists, statutes, regulations, contract examples, FDD review notes, and lawyer-reviewed corrections. In production, those source documents should be split into chunks, embedded, and stored in database tables.

Likely tables:

```text
documents
document_chunks
chunk_embeddings
sources
matters
feedback
reviewed_notes
```

The RAG database should store searchable chunks, not only whole files. Each chunk should include metadata such as source, page, section, jurisdiction, matter type, approval status, and updated date.

RAG should provide the legal knowledge. The model should use retrieved sources to answer. Fine-tuning is not needed for the first version.

Continuous learning should be human-reviewed:

1. Save useful conversations and feedback.
2. Remove private or unsafe data.
3. Have a lawyer or trusted reviewer approve the correction.
4. Add approved notes to RAG.
5. Use rejected/bad answers as evaluation cases.
