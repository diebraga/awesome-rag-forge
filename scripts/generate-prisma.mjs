import { spawnSync } from "node:child_process";

const placeholderDatabaseUrl =
  "postgresql://user:password@localhost:5432/awesome_rag_forge?schema=public";

const env = { ...process.env };
if (!env.DATABASE_URL?.trim()) {
  env.DATABASE_URL = placeholderDatabaseUrl;
  console.log(
    "DATABASE_URL is not configured; using a local placeholder only for Prisma client generation.",
  );
}

const result = spawnSync("prisma", ["generate"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
