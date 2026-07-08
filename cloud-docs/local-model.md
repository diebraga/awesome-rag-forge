# Local Model

The app currently runs against Ollama on the user's machine.

Local model server:

```text
http://127.0.0.1:11434
```

Installed test model:

```text
qwen2.5:7b-instruct
```

Previously available model:

```text
qwen2.5-coder:7b
```

The chat route defaults to:

```text
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
```

For local testing, Ollama must be running. The current Next.js API route calls Ollama's `/api/chat` endpoint with `stream: false`.

The local model is useful for proof-of-concept testing, but this exact setup will not work on ordinary hosted Next.js deployments unless the deployed app can reach a model server.
