import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { createPortableBrainSnapshot, summarizePortableBrainSnapshot } from "../lib/portable-brain";
import { disconnectPrisma, prisma } from "../mcp/rag-manager/prisma";

function readArgs(argv: string[]) {
  const args = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") && arg !== "-o") continue;
    if (arg === "--include-pending" || arg === "--include-feedback") {
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
  const output = args.get("--output") ?? args.get("-o");
  const snapshot = await createPortableBrainSnapshot(prisma, {
    includePendingReview: args.has("--include-pending"),
    includeFeedbackAndReviews: args.has("--include-feedback"),
  });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (typeof output === "string") {
    await writeFile(output, json, "utf-8");
    console.log(`Exported portable brain snapshot to ${output}`);
  } else {
    process.stdout.write(json);
  }
  console.error(summarizePortableBrainSnapshot(snapshot));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
