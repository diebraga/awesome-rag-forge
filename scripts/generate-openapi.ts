import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { PROJECT_NAME } from "../lib/project";

/**
 * Build-time OpenAPI generation, deliberately not runtime. Scanning route
 * source files for @swagger JSDoc comments via glob + fs at request time
 * would be fragile on serverless platforms (Vercel's file tracing only
 * bundles files that are actually imported, not arbitrary source read via
 * fs/glob) — so this writes a generated JSON artifact imported by the
 * gated /api-docs/openapi.json route. Run via `npm run generate:openapi`, wired
 * into `prebuild` so it's regenerated automatically on every build.
 *
 * Adding a new endpoint to the spec means adding a @swagger JSDoc block to
 * its route.ts file — see any existing route for the pattern — then
 * re-running this script (or just building). Nothing else needs updating.
 */

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: `${PROJECT_NAME} API`,
      version: "0.1.0",
      description:
        "Read-only RAG chat/knowledge-base API, plus one narrow write endpoint (POST /api/feedback) that can only ever create a RagFeedback row. All knowledge writes happen exclusively through the MCP server (mcp/rag-manager), which this API cannot reach — see docs/architecture.md. Generate a client in any language from this spec with https://openapi-generator.tech.",
    },
    servers: [{ url: "/", description: "Same origin as this deployment" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "APP_API_KEY, sent as `Authorization: Bearer <key>`. Only enforced when APP_API_KEY is configured server-side; required (fail-closed) on Vercel deployments. See lib/testing-api-auth.ts.",
        },
      },
    },
  },
  apis: ["app/api/**/route.ts"],
});

const outputPath = join(process.cwd(), "app", "api-docs", "openapi.generated.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(spec, null, 2));

const pathCount = Object.keys((spec as { paths?: object }).paths ?? {}).length;
console.log(`Wrote ${outputPath} (${pathCount} path(s)).`);
