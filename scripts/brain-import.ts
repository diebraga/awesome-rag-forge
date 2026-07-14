import "dotenv/config";
import { readFile } from "node:fs/promises";
import { importPortableBrainSnapshot, parsePortableBrainSnapshot } from "../lib/portable-brain";
import { disconnectPrisma, prisma } from "../mcp/rag-manager/prisma";

function readArgs(argv: string[]) {
  const args = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") && arg !== "-f") continue;
    if (arg === "--apply") {
      args.set(arg, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    args.set(arg, value);
    index += 1;
  }
  return args;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const file = args.get("--file") ?? args.get("-f");
  const mode = args.get("--mode") ?? "skip";
  if (typeof file !== "string") throw new Error("Missing --file <snapshot.json>");
  if (mode !== "skip" && mode !== "upsert") throw new Error("--mode must be skip or upsert");

  const snapshot = parsePortableBrainSnapshot(JSON.parse(await readFile(file, "utf-8")));
  const result = await importPortableBrainSnapshot(prisma, snapshot, {
    dryRun: !args.has("--apply"),
    mode,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!args.has("--apply")) {
    console.log("Dry run only. Re-run with --apply to write rows, then run npm run rag:embeddings:backfill.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
