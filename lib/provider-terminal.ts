import { spawn } from "node:child_process";

export const PROVIDER_TERMINAL_UNAVAILABLE_ERROR =
  "Opening a terminal automatically is only supported on macOS outside production.";

/**
 * Whether this server process may open a terminal on the host machine.
 * Same posture as the deleted lib/setup-terminal.ts's canOpenSetupTerminal():
 * macOS only, never in production, since app/api never ships to a deployed
 * instance anyway (see docs/deployment.md).
 */
export function canOpenProviderTerminal({
  platform = process.platform,
  isProduction = process.env.NODE_ENV === "production",
}: { platform?: NodeJS.Platform; isProduction?: boolean } = {}) {
  return !isProduction && platform === "darwin";
}

/**
 * Quotes a value for safe use inside a single POSIX shell argument. See the
 * deleted lib/setup-terminal.ts (git history, commit 57b1e27) for why
 * JSON.stringify is not a substitute: it produces double-quote JSON syntax,
 * which breaks the outer AppleScript string literal instead of escaping
 * into it.
 */
export function shellQuoteSingleArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptQuoteString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Exported (only) for unit testing the shell/AppleScript escaping in isolation. */
export function buildOpenTerminalScript(repoRoot: string, shellCommandSuffix: string): string {
  const shellCommand = `cd ${shellQuoteSingleArg(repoRoot)} && ${shellCommandSuffix}`;
  return `tell application "Terminal" to do script "${appleScriptQuoteString(shellCommand)}"`;
}

/** Opens Terminal.app, cd's into repoRoot, and runs shellCommandSuffix. Rejects with a plain, safe-to-display Error if osascript itself fails. */
export function openTerminalWithCommand(shellCommandSuffix: string, repoRoot: string = process.cwd()): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = buildOpenTerminalScript(repoRoot, shellCommandSuffix);
    const child = spawn("osascript", ["-e", script]);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Unable to open a terminal window."));
    });
  });
}
