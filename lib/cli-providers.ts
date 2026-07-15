import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CliProviderId = "claude" | "codex" | "gemini";

export type CliProvider = {
  id: CliProviderId;
  label: string;
  binary: string;
  installCommand: string;
};

/** The AI CLIs that can add knowledge via this repo's MCP server (docs/mcp-server.md). Cursor/Windsurf/Cline are editor integrations, not terminal-launchable, so they're excluded. */
export const CLI_PROVIDERS: CliProvider[] = [
  { id: "claude", label: "Claude Code", binary: "claude", installCommand: "npm install -g @anthropic-ai/claude-code" },
  { id: "codex", label: "Codex CLI", binary: "codex", installCommand: "npm install -g @openai/codex" },
  { id: "gemini", label: "Gemini CLI", binary: "gemini", installCommand: "npm install -g @google/gemini-cli" },
];

export function getCliProvider(id: string): CliProvider | undefined {
  return CLI_PROVIDERS.find((provider) => provider.id === id);
}

export async function isCliAvailable(binary: string): Promise<boolean> {
  try {
    await execFileAsync("which", [binary]);
    return true;
  } catch {
    return false;
  }
}
