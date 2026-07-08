# Project

Legal Bot is a Next.js application for testing a legal AI assistant. The current product surface is a centered chat UI where a user can ask legal questions and receive general legal information from a locally running model.

The project is intentionally early-stage. It is not yet a full legal advice product, and it does not yet include RAG, document upload, lawyer review workflows, authentication, billing, or a production model server.

The near-term goal is to prove the interaction loop:

1. User asks a question in the browser.
2. Next.js sends the chat history to a server route.
3. The server route calls a local model through Ollama.
4. The UI displays the model response.

The product direction is a legal preparation assistant: it should help users understand issues, organize questions, identify risk, and know when a licensed lawyer should review the matter. It should avoid presenting itself as a substitute for a lawyer.
