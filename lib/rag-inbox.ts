import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RAG_INBOX_DIRNAME = ".rag-inbox";

/**
 * Stages uploaded file contents flat under <repoRoot>/.rag-inbox/, so a
 * launched CLI can be told "add the files in .rag-inbox/" without the app
 * ever needing real filesystem paths from the browser's file picker.
 * Filenames are sanitized (slashes stripped) since they're client-supplied
 * over an HTTP request -- a trust boundary.
 */
export function writeToInbox(files: { name: string; content: Buffer }[], repoRoot: string = process.cwd()): string {
  const inboxDir = join(repoRoot, RAG_INBOX_DIRNAME);
  mkdirSync(inboxDir, { recursive: true });
  for (const file of files) {
    const safeName = file.name.replace(/[\\/]/g, "_");
    writeFileSync(join(inboxDir, safeName), file.content);
  }
  return inboxDir;
}
