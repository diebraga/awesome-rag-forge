import * as readline from "node:readline";

// Shared by setup-env.ts (DATABASE_URL/storage) and setup-provider.ts (a
// single hosted-provider API key) — masked terminal input, no dependency.
export function askMasked(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Only ever used for the cosmetic *-count redraw below — the actual
    // returned value comes from readline's own `answer` argument in
    // rl.question's callback, since readline's line buffer is the reliable,
    // well-tested source of truth for what was actually typed or pasted.
    let displayLength = 0;
    process.stdin.setEncoding("utf8");

    // "data" fires once per chunk, not once per character — a pasted value
    // (the common case for a long key) arrives as one multi-character
    // chunk, so each character in it must be walked individually rather
    // than assuming the whole chunk is a single keystroke.
    const onData = (chunk: string) => {
      for (const char of chunk) {
        const code = char.charCodeAt(0);
        if (char === "\n" || char === "\r" || code === 4) continue;
        if (code === 127 || code === 8) {
          displayLength = Math.max(0, displayLength - 1);
        } else {
          displayLength += 1;
        }
      }
      // clearLine/cursorTo only exist on a real TTY (not a pipe, e.g. in
      // automated tests) — masking the redraw is cosmetic, so degrade to no
      // redraw rather than crashing when stdout isn't a terminal.
      if (process.stdout.isTTY) {
        readline.cursorTo(process.stdout, 0);
        process.stdout.clearLine(0);
        process.stdout.write(query + "*".repeat(displayLength));
      }
    };

    process.stdin.on("data", onData);
    rl.question(query, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}
