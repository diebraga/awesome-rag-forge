import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { buildOpenTerminalScript, canOpenProviderTerminal, shellQuoteSingleArg } from "./provider-terminal";

describe("canOpenProviderTerminal", () => {
  test("true on macOS outside production", () => {
    expect(canOpenProviderTerminal({ platform: "darwin", isProduction: false })).toBe(true);
  });

  test("false in production", () => {
    expect(canOpenProviderTerminal({ platform: "darwin", isProduction: true })).toBe(false);
  });

  test("false on non-macOS platforms", () => {
    expect(canOpenProviderTerminal({ platform: "linux", isProduction: false })).toBe(false);
    expect(canOpenProviderTerminal({ platform: "win32", isProduction: false })).toBe(false);
  });
});

// Regression coverage for the JSON.stringify-in-AppleScript bug fixed in the
// deleted lib/setup-terminal.ts (git history, commit 57b1e27): osacompile
// validates AppleScript syntax without executing the script.
describe.skipIf(process.platform !== "darwin")("buildOpenTerminalScript", () => {
  function assertValidAppleScript(script: string) {
    execFileSync("osacompile", ["-o", "/dev/null", "-"], { input: script });
  }

  test("produces valid AppleScript for a plain command", () => {
    expect(() =>
      assertValidAppleScript(buildOpenTerminalScript("/Users/dev/awesome-rag-forge", "npm run setup")),
    ).not.toThrow();
  });

  test("produces valid AppleScript for a command containing quoted text", () => {
    expect(() =>
      assertValidAppleScript(
        buildOpenTerminalScript("/Users/dev/repo", `claude ${shellQuoteSingleArg("Add these files")}`),
      ),
    ).not.toThrow();
  });

  test("produces valid AppleScript for a path with a space and single quote", () => {
    expect(() =>
      assertValidAppleScript(buildOpenTerminalScript("/Users/dev's-machine/awesome rag forge", "npm run setup")),
    ).not.toThrow();
  });
});
