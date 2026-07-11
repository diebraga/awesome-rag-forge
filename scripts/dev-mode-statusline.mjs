// Claude Code statusline badge reflecting the project's operating mode.
// Reads DEVELOPER_MODE from the project's .env (same structural source of truth
// as lib/developer-mode.ts) and prints a permanent, always-visible badge — the
// assistant-side counterpart to the web UI's Developer Mode banner. It never
// changes the mode; switching back to Operator Mode is a one-line .env edit.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let stdin = "";
try {
  stdin = readFileSync(0, "utf8");
} catch {
  // No stdin (e.g. run manually) — fall back to process.cwd() below.
}

let cwd = process.cwd();
try {
  const payload = JSON.parse(stdin);
  cwd = payload.workspace?.current_dir || payload.cwd || payload.workspace?.project_dir || cwd;
} catch {
  // Not JSON — keep process.cwd().
}

let developerMode = false;
try {
  const env = readFileSync(join(cwd, ".env"), "utf8");
  const match = env.match(/^\s*DEVELOPER_MODE\s*=\s*"?([^"\n#]*)"?/m);
  developerMode = (match?.[1] ?? "").trim().toLowerCase() === "true";
} catch {
  // No .env → Operator Mode (fail safe).
}

process.stdout.write(
  developerMode
    ? "\x1b[41;97;1m ⚠ DEVELOPER MODE \x1b[0m"
    : "\x1b[2m● Operator Mode\x1b[0m",
);
