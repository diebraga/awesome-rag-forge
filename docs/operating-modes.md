# Operating Modes

## Purpose

This project can be used in two different ways:

1. As a local MCP knowledge-base manager.
2. As a codebase that a developer intentionally modifies.

Those two workflows are easy to blur in an AI coding tool, so the project defines an explicit operating-mode boundary.

Developer Mode is only about changing the repository itself: folder structure, source files, schema files, dependency files, scripts, generated code, docs-as-code, or application architecture. It is not about normal MCP operations.

## What MCP Is For

The MCP server is explicitly allowed to build and manage the project's RAG knowledge base and harness. That is the core product.

Through MCP tools, a connected assistant may:

- Inspect the current knowledge base.
- Decide how new user-provided knowledge should be organized.
- Propose collections, documents, chunks, metadata, tags, category, and domain.
- Save user-approved RAG knowledge into the database as `PENDING_REVIEW`.
- Review, approve, reject, correct, or archive knowledge through the supported MCP workflows.
- Create and manage harness capability/restriction rules through the supported proposal and review workflows.
- Review feedback, create eval cases, and mark feedback resolved.
- Perform database writes that the MCP tool explicitly supports, as long as the tool's approval and review requirements are satisfied.

For destructive or high-impact MCP actions, such as archiving a document, changing approved knowledge, or changing harness behavior, the assistant must clearly explain what will happen and ask the user for confirmation before calling the write tool.

None of the above is Developer Mode. These are normal MCP Operator Mode actions.

## Operator Mode

Operator Mode is the normal mode for people using the MCP server locally.

In Operator Mode, the connected assistant should behave like a knowledge-base operator, not a software developer. This mode still allows MCP database writes, including creating RAG knowledge, creating harness rules, approval-gated changes, and destructive knowledge-base operations such as archiving. That is the point of the MCP server.

Allowed in Operator Mode through MCP tools:

- List/search collections, documents, and chunks.
- Create collections when the user approves.
- Propose new knowledge sources.
- Approve user-approved source proposals into `PENDING_REVIEW`.
- Upload/extract files through the MCP workflow.
- Review and approve/reject chunks.
- Correct chunks through `propose_chunk_update` -> user approval -> `approve_chunk_update`.
- Archive outdated documents through `archive_document` after explicit user approval.
- Review feedback using the feedback review loop.
- Create eval cases.
- Propose, approve, review, and reject harness rules.
- Set assistant identity/config through the supported MCP tool.

Not allowed in Operator Mode because these are Developer Mode repository changes, not MCP knowledge-base operations:

- Editing repository/source files.
- Changing `prisma/schema.prisma` or generated client structure.
- Installing/removing npm packages.
- Refactoring code.
- Rewriting docs as a repository code change.
- Changing scripts, build config, or application architecture.
- Running shell commands to mutate the repo outside the MCP tool workflow.

MCP database writes are not on this forbidden list. If a supported MCP tool writes to the database and its approval rules are satisfied, it is allowed in Operator Mode.

The MCP server does not expose tools for editing project files. Normal MCP tools are allowed to write to the application database where they are designed to do so: knowledge, feedback, evals, review state, assistant config, harness rules, and archival state. Developer Mode is only about changing the software project itself.

## Developer Mode

Developer Mode is an explicit opt-in for changing the software project itself. It is not required for normal MCP knowledge-base operations, even when those operations write to the database or archive knowledge.

Developer Mode may involve:

- Editing source files.
- Changing database schema.
- Adding dependencies.
- Updating scripts.
- Running Prisma schema pushes or migrations for project schema changes. Normal MCP knowledge writes do not count as Developer Mode.
- Changing MCP tool behavior.
- Changing the Next.js app.

Before doing this, a connected assistant should warn the user:

```text
You are leaving MCP Operator Mode and entering Developer Mode.
Developer Mode can modify repository files, dependencies, database schema, scripts, and application behavior.
Normal MCP knowledge-base operations do not need Developer Mode; this warning is only for changing the software project itself.
Continue?
```

If the user confirms, the assistant may proceed according to the capabilities and permissions of the host tool.

## `DEVELOPER_MODE`

`DEVELOPER_MODE` is an environment signal for connected agents.

The template `.env.example` sets:

```env
DEVELOPER_MODE=true
```

This is intentional for this repository because the checkout is also used by developers who modify the project.

For non-technical local MCP users who only want the knowledge-base manager and do not want agents to edit the repository itself, set:

```env
DEVELOPER_MODE=false
```

When `DEVELOPER_MODE=false`, the assistant should still perform normal MCP database operations when the user approves them, including adding knowledge, reviewing chunks, archiving documents, reviewing feedback, creating evals, and managing harness rules. It should refuse source-code/schema/dependency/repository edits unless the user explicitly asks to enter Developer Mode and acknowledges the warning.

When `DEVELOPER_MODE=true`, the assistant should still distinguish normal MCP operation from software development. A true value means repository-development work is available after explicit user intent; it does not mean every MCP request is a code-change request.

## Agent Behavior Rule

When a user asks for MCP work, assume Operator Mode. Do not modify repository files just because the MCP server is running from a local checkout.

When a user asks to change source code, project structure, Prisma schema, dependencies, scripts, or application behavior, treat that as Developer Mode and show the warning above before proceeding.

## Important Limitation

The MCP server can control only MCP tools. It cannot prevent an external coding agent from editing files if that agent also has filesystem or shell access.

This boundary is therefore enforced by:

1. MCP tool design: no file-editing tools are exposed.
2. Agent instructions: assistant entry files point here and tell agents to respect Operator Mode.
3. Environment signal: `DEVELOPER_MODE` communicates whether developer work is expected.
4. User confirmation: code/schema/dependency changes require explicit developer intent.
