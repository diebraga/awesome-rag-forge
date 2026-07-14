# Scoped Knowledge

Scoped knowledge is the recommended way to add per-person, per-company, per-project, or per-workspace memory without turning this project into an auth system or a SaaS user database.

The rule is simple: **Awesome RAG Forge does not need to own users. It owns knowledge scopes.**

A scope is a generic reference that says "this knowledge belongs to, or is visible to, this subject." The subject can be a local profile, a user from another application, a team, a customer, a project, an agent, or any other external identity. The RAG layer only needs a stable scope reference; it does not need email addresses, passwords, billing records, organization roles, or any other application-specific user data.

## Why scopes instead of users

A concrete `User` table would make the project less reusable because it implies:

- this project owns identity;
- every adopter must fit their users into this schema;
- authentication, roles, organizations, and billing belong here;
- MCP tools should understand one specific user model.

That is not the goal. This project is a generic local-first RAG forge. It should be easy to embed beside another application's own user database without forcing that application to remodel itself.

Use a scope instead:

```text
KnowledgeScope
  id              internal scope id
  kind            profile | person | team | company | project | workspace | agent | external
  label           human-readable name, e.g. Maria or Acme Support
  externalRef     optional id from another system, e.g. users.8492
  metadata        optional JSON for non-secret integration hints
```

The external application, if one exists, keeps owning its real users:

```text
Their app
  User
    id: user_8492
    name: Maria
    email/password/roles/billing/etc.

Awesome RAG Forge
  KnowledgeScope
    kind: person
    label: Maria
    externalRef: user_8492
```

The bridge is `externalRef`, not a hard dependency on their schema.

## Custom app tables without direct relationships

If a host project already has users, tenants, organizations, workspaces, or customers, it may create or keep those tables in its own schema. That alone does not break Awesome RAG Forge.

The important rule is that the existing RAG tables should not be made dependent on those custom app tables through required Prisma relations.

Safe pattern:

```prisma
model AppUser {
  id        String @id
  name      String
  email     String?
  createdAt DateTime @default(now())
}

model RagCollection {
  id               String @id @default(cuid())
  name             String
  scopeKind        String?
  scopeExternalRef String?
}
```

In that pattern, `scopeExternalRef` is just data. It can contain `user_123`, `tenant_456`, `workspace_acme`, or any other stable id from the host system. The MCP server can store and retrieve against that value once scope-aware logic exists, but Prisma does not force the MCP server to create a valid `AppUser` relation every time it creates RAG knowledge.

Risky pattern:

```prisma
model RagCollection {
  id     String @id @default(cuid())
  name   String
  userId String
  user   AppUser @relation(fields: [userId], references: [id])
}
```

That changes the RAG write contract. Existing MCP tools that create collections do not know how to satisfy a required `userId` or a required relation unless the tools are updated too. The result is usually a Prisma validation/runtime error, not graceful personalization.

Use this rule of thumb:

```text
Additive nullable columns/tables: usually safe.
Plain external reference fields: safe when the code knows how to use them.
Required fields or relations on MCP-written tables: breaking unless MCP code is updated.
Changing existing relation names, enum meanings, or nullability: breaking.
```

So the right integration shape is not "hard-coded ids everywhere." It is a deliberate soft-reference boundary:

```text
Host app owns identity and permissions.
Awesome RAG Forge stores a stable external reference.
MCP/retrieval logic filters by that reference.
No direct Prisma relation is required between the two worlds.
```

## Mental model

Think of the database as one knowledge library with rooms:

```text
Global room
  shared knowledge everyone may retrieve

Maria room
  private or personalized knowledge for Maria

Company room
  internal knowledge for one company/workspace

External room
  end-user-facing knowledge approved for chat
```

The LLM does not browse the whole building. Retrieval opens only the rooms allowed for the current request.

```text
Current request
  subject: Maria
  scope refs: global + scope_maria
  audience: EXTERNAL/INTERNAL/RESTRICTED policy
  visibility: CHAT/OPERATOR/REVIEW/EVAL policy

Retrieval result
  only approved chunks matching those scope and visibility rules
```

This keeps personalization possible without making the core RAG engine care where the person or workspace came from.

## How scoped retrieval should work

The retrieval layer should accept a small scope descriptor from its caller:

```json
{
  "scope": {
    "kind": "person",
    "externalRef": "user_8492",
    "label": "Maria"
  },
  "includeGlobal": true,
  "visibility": "CHAT"
}
```

The storage/write side resolves that descriptor into an internal `KnowledgeScope` row, creating it if appropriate and approved. The read side uses the resolved scope id to filter collections, documents, and chunks.

A chat request for Maria should retrieve:

```text
APPROVED global knowledge
+ APPROVED knowledge attached to Maria's scope
+ only rows allowed by audience/visibility policy
```

It must not retrieve:

```text
another profile's private knowledge
restricted knowledge unless the caller is explicitly allowed to use it
pending/rejected/archived chunks
operator-only knowledge for a normal chat request
```

## How the MCP should add scoped knowledge

The MCP server should keep speaking in user-friendly language while internally writing to scopes.

Examples:

```text
User: Add this preference to Maria.
MCP: resolve or create KnowledgeScope(kind=person, externalRef or label=Maria)
MCP: save the knowledge under that scope after the normal proposal/approval rules.
```

```text
User: Add this PDF to customer 8492's private knowledge.
MCP: resolve KnowledgeScope(externalRef=customer_8492)
MCP: propose file upload, classify audience/visibility, ask required questions, then write only after approval.
```

```text
User: Add this as company-internal knowledge for Acme.
MCP: resolve KnowledgeScope(kind=company, label=Acme)
MCP: keep audience INTERNAL unless the user explicitly chooses otherwise.
```

The important implementation boundary is:

```text
MCP tools may accept a scope descriptor.
MCP tools should not require or understand a full User table.
```

If a caller says "user ID x," the MCP can map that to a scope like this:

```json
{
  "kind": "person",
  "externalRef": "user:x",
  "label": "User x"
}
```

That is enough for the RAG layer.

## Relationship to audience and visibility

Scopes answer **who or what the knowledge is attached to**.

Audience answers **how sensitive or shareable the knowledge is**:

- `EXTERNAL` - approved for end-user/shareable chat contexts.
- `INTERNAL` - operator, company, or builder knowledge.
- `RESTRICTED` - sensitive/high-risk knowledge requiring extra care.

Visibility answers **which product surfaces may use the knowledge**:

- `CHAT`
- `OPERATOR`
- `REVIEW`
- `EVAL`

These are independent dimensions.

For example:

```text
Maria's product preferences
  scope: Maria
  audience: EXTERNAL
  visibility: CHAT
```

```text
Maria's private API key note
  scope: Maria
  audience: RESTRICTED
  visibility: REVIEW or OPERATOR only
```

```text
Company internal process
  scope: Acme workspace
  audience: INTERNAL
  visibility: OPERATOR
```

Do not use `scope` as a substitute for sensitivity. A private scope can still contain knowledge that is safe for chat, and a global scope can still contain knowledge that should never appear in chat.

## Local profile layer

A local-only profile picker can be built on top of scopes without changing the RAG core.

Minimal local profile shape:

```text
LocalProfile
  id
  displayName
  defaultScopeId
```

When the user selects Maria in the UI or starts an MCP session for Maria, the caller passes Maria's scope into retrieval and write tools. The chat can greet Maria because the caller knows the selected profile, not because the RAG guessed it.

```text
Selected profile: Maria
Chat boot context: displayName=Maria, scopeId=scope_maria
Assistant: Hi Maria, how are you doing?
```

The greeting belongs to session/profile context. Durable personal facts belong to scoped RAG knowledge only when they are useful future retrieval content.

## External application integration

An application that already has users should keep them in its own database and pass a stable reference into Awesome RAG Forge.

Recommended adapter contract:

```json
{
  "subject": {
    "kind": "person",
    "externalRef": "users.8492",
    "label": "Maria"
  },
  "allowedScopes": ["global", "users.8492", "workspace.acme"],
  "mode": "chat"
}
```

The external app is responsible for authenticating Maria and deciding which scope refs she is allowed to use. Awesome RAG Forge is responsible for storing and retrieving knowledge only inside those allowed scope boundaries.

This makes the design microservice-compatible without requiring a microservice now.

## Microservice boundary

Scoped knowledge does not require a separate service. The local project can keep one app, one database, and one MCP server.

But scopes create a clean future service boundary:

```text
POST /knowledge/search
POST /knowledge/add
POST /knowledge/scopes/resolve
```

Those endpoints would accept generic scope descriptors, not app-specific user tables. If someone later wraps the RAG engine as a standalone service, they do not need to rewrite the knowledge model.

## What not to do

Do not add a project-owned auth/user system just to support personalization.

Avoid:

```text
User
  email
  passwordHash
  billingPlan
  organizationRole
```

inside the core RAG schema unless the project explicitly becomes a hosted multi-user product. That would make the open-source forge less generic and harder to embed.

Also avoid storing secrets or sensitive personal records in retrievable chat-visible knowledge. If a scope receives sensitive material, classify it as `RESTRICTED` and keep it out of `CHAT` visibility unless the user deliberately changes that policy.

## Practical rule for agents

When a user asks for per-user, per-client, per-company, or per-project memory, translate that into scoped knowledge:

```text
Do not ask: Should I add a User table?
Ask: What scope should this knowledge belong to, and what audience/visibility should it have?
```

If the user provides a concrete user id, treat it as `externalRef`. If the user provides a name only, create or choose a labeled scope after confirming ambiguity. If the user does not provide any scope, default to the existing global collection behavior and ask only when the prompt implies personalization or restricted/internal ownership.

## Current implementation

Scoped knowledge is implemented with `KnowledgeScope` plus nullable `scopeId` fields on `RagCollection`, `RagDocument`, `RagChunk`, and `RagEvalCase`. Built-in scope kinds are `GLOBAL`, `USER`, `TEAM`, `ORGANIZATION`, `PROJECT`, `AGENT`, `SESSION`, and `CUSTOM`.

`KnowledgeScope` is not an auth model. Do not add passwords, sessions, memberships, billing, or host-app users here. Store the host app's id in `externalRef` and let the host app decide which scopes are active for a request.

Default chat retrieval includes the stable `knowledge_scope_global` scope and legacy `NULL` scope rows. Future integrations can pass additional active scope ids, for example global + Maria + Project X, while still preserving audience and visibility checks.
