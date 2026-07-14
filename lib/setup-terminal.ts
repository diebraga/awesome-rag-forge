import { spawn } from "node:child_process";

export const SETUP_TERMINAL_UNAVAILABLE_ERROR =
  "Opening a terminal automatically is only supported on macOS outside production. Run `npm run setup` in your own terminal instead.";

/**
 * Whether this server process is allowed to open a terminal on the host
 * machine running it. Deliberately conservative, mirroring
 * canAutoStartOllama() in lib/ollama.ts: macOS only (osascript), and never
 * in production, so a deployed instance (which never ships this route's
 * code anyway, since app/api never reaches Vercel — see docs/deployment.md)
 * can't be tricked into spawning a GUI process on its host.
 */
export function canOpenSetupTerminal({
  platform = process.platform,
  isProduction = process.env.NODE_ENV === "production",
}: { platform?: NodeJS.Platform; isProduction?: boolean } = {}) {
  return !isProduction && platform === "darwin";
}

/**
 * Quotes a value for safe use inside a single POSIX shell argument: wraps it
 * in single quotes, escaping any embedded single quote as '\''. AppleScript
 * string literals need their own separate escaping — see
 * appleScriptQuoteString() below — do not conflate the two. (JSON.stringify
 * is NOT a substitute for either: it produces double-quoted JSON syntax,
 * which breaks the outer AppleScript string literal instead of escaping
 * into it.)
 */
function shellQuoteSingleArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Escapes a string for embedding inside an AppleScript double-quoted string literal. */
function appleScriptQuoteString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Builds the AppleScript passed to `osascript -e`. Exported (only) for unit
 * testing the shell/AppleScript escaping in isolation, without spawning a
 * real process.
 */
export function buildOpenTerminalScript(repoRoot: string): string {
  const shellCommand = `cd ${shellQuoteSingleArg(repoRoot)} && npm run setup`;
  return `tell application "Terminal" to do script "${appleScriptQuoteString(shellCommand)}"`;
}

/**
 * Opens Terminal.app, cd's into this repo's root, and runs `npm run setup`.
 * Only ever called after canOpenSetupTerminal() and the caller's local-
 * request guard both pass. Rejects with a plain Error if osascript itself
 * fails (e.g. Terminal.app unavailable) — the caller decides how to surface
 * that, matching startOllamaLocally()'s pattern of only ever throwing
 * safe-to-display messages.
 */
export function openSetupTerminal(repoRoot: string = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = buildOpenTerminalScript(repoRoot);
    const child = spawn("osascript", ["-e", script]);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Unable to open a terminal window."));
    });
  });
}
