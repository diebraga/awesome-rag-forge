# Harness

The harness is the backend workflow around the model. It is not just Markdown and not just RAG.

The harness includes:

```text
API routes
tool definitions
backend functions
prompt templates
validation rules
logging
feedback collection
escalation logic
```

In this project, the first harness piece is:

```text
app/api/chat/route.ts
```

Future approved tools/actions may include:

```text
search_rag
extract_document_text
detect_jurisdiction
classify_legal_issue
check_citations
create_matter_package
request_lawyer_review
save_feedback
```

Each tool should have:

```text
name
description
input schema
real backend function
permission rules
logging
```

The harness should decide what the model can do, when it can do it, what it must cite, what it must refuse, and when it must escalate to a human lawyer.
