#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { server } from "./server";
import { disconnectPrisma } from "./prisma";

const DEFAULT_PORT = 3200;
const port = Number(process.env.MCP_HTTP_PORT) || DEFAULT_PORT;

// Bind to localhost only, deliberately — mirrors lib/ollama.ts's
// canAutoStartOllama() posture: local-only by default, no accidental
// network exposure. This server has full read/write access to the
// knowledge base (see docs/security.md's "MCP server trust boundary");
// widening MCP_HTTP_HOST means putting real authentication in front of it
// first, not just changing this value.
const host = process.env.MCP_HTTP_HOST || "127.0.0.1";

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
