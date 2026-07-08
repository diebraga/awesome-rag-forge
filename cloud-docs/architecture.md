# Architecture

Current architecture:

```text
Browser chat UI
        ↓
Next.js app/page.tsx
        ↓
Next.js API route: app/api/chat/route.ts
        ↓
Ollama local server
        ↓
qwen2.5:7b-instruct
```

Important files:

```text
app/page.tsx              Chat UI and local message state
app/api/chat/route.ts     Server route that calls Ollama
components/ui/*           shadcn UI primitives
lib/utils.ts              shadcn utility helper
components.json           shadcn configuration
```

The UI uses shadcn components:

```text
Card
Button
Input
Avatar
ScrollArea
Separator
```

The API route includes a system prompt that frames the assistant as a careful legal information assistant. It asks the model to give general legal information, avoid invented citations, ask for jurisdiction when needed, and recommend lawyer review for high-risk situations.
