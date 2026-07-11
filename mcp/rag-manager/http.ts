#!/usr/bin/env node
import "dotenv/config";
import { appendFileSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { server } from "./server";
import { disconnectPrisma } from "./prisma";
import { checkAuth, generateAuthToken } from "./http-auth";

const DEFAULT_PORT = 3200;
const port = Number(process.env.MCP_HTTP_PORT) || DEFAULT_PORT;

// Bind to localhost only, deliberately — mirrors lib/ollama.ts's
// canAutoStartOllama() posture: local-only by default, no accidental
// network exposure. This server has full read/write access to the
// knowledge base (see docs/security.md's "MCP server trust boundary");
// widening MCP_HTTP_HOST means putting real authentication in front of it
// first, not just changing this value.
const host = process.env.MCP_HTTP_HOST || "127.0.0.1";

// A random token, distinct from the Next.js testing surface's APP_API_KEY —
// the two guard different privilege levels (read-only testing vs. full
// knowledge-base write access), so they must never share a credential.
// Generated once on first run and persisted to .env; every request to /mcp
// must present it, so this transport is fail-closed by default instead of
// the previous "no authentication" posture.
function ensureAuthToken(): string {
  const existing = process.env.MCP_AUTH_TOKEN?.trim();
  if (existing) return existing;

  const token = generateAuthToken();
  const envPath = join(process.cwd(), ".env");
  try {
    appendFileSync(envPath, `${existsSync(envPath) ? "\n" : ""}MCP_AUTH_TOKEN="${token}"\n`);
    console.error(`Generated MCP_AUTH_TOKEN and saved it to ${envPath}.`);
  } catch (error) {
    console.error(
      `Generated MCP_AUTH_TOKEN but could not save it to ${envPath} (${(error as Error).message}). ` +
        "It will not persist past this run — set MCP_AUTH_TOKEN in .env yourself to keep it stable.",
    );
  }
  console.error(`MCP HTTP transport requires this header on every request: Authorization: Bearer ${token}`);
  process.env.MCP_AUTH_TOKEN = token;
  return token;
}

const authToken = ensureAuthToken();

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

async function main() {
  await server.connect(transport);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found. This MCP server only serves /mcp.");
      return;
    }

    const authResult = checkAuth(req, authToken);
    if (!authResult.ok) {
      res
        .writeHead(401, {
          "Content-Type": "text/plain",
          "WWW-Authenticate": 'Bearer realm="awesome-rag-forge-mcp"',
        })
        .end("Invalid or missing MCP_AUTH_TOKEN bearer token.");
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" }).end("Internal server error.");
      }
    }
  });

  httpServer.listen(port, host, () => {
    console.error(`rag-manager MCP server listening on http://${host}:${port}/mcp`);
  });
}

main().catch(async (error) => {
  console.error(error);
  await disconnectPrisma();
  process.exit(1);
});

process.on("SIGINT", async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectPrisma();
  process.exit(0);
});
