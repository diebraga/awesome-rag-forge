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
 * Opens Terminal.app, cd's into this repo's root, and runs `npm run setup`.
 * Only ever called after canOpenSetupTerminal() and the caller's local-
 * request guard both pass. Rejects with a plain Error if osascript itself
 * fails (e.g. Terminal.app unavailable) — the caller decides how to surface
 * that, matching startOllamaLocally()'s pattern of only ever throwing
 * safe-to-display messages.
 */
export function openSetupTerminal(repoRoot: string = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = `tell application "Terminal" to do script "cd ${JSON.stringify(repoRoot)} && npm run setup"`;
    const child = spawn("osascript", ["-e", script]);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Unable to open a terminal window."));
    });
  });
}
