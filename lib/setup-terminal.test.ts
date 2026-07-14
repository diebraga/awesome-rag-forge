import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { buildOpenTerminalScript, canOpenSetupTerminal } from "./setup-terminal";

describe("canOpenSetupTerminal", () => {
  test("true on macOS outside production", () => {
    expect(canOpenSetupTerminal({ platform: "darwin", isProduction: false })).toBe(true);
  });

  test("false in production", () => {
    expect(canOpenSetupTerminal({ platform: "darwin", isProduction: true })).toBe(false);
  });

  test("false on non-macOS platforms", () => {
    expect(canOpenSetupTerminal({ platform: "linux", isProduction: false })).toBe(false);
    expect(canOpenSetupTerminal({ platform: "win32", isProduction: false })).toBe(false);
  });
});

// Regression test for a real bug caught during manual verification: an
// earlier version used JSON.stringify() to quote the path, which produces
// JSON double-quote syntax that breaks the outer AppleScript string literal
// instead of escaping into it (osascript failed with a syntax error on every
// real path). osacompile validates AppleScript syntax without executing the
// script, so this catches the regression without actually opening a
// terminal during `npm test`.
describe.skipIf(process.platform !== "darwin")("buildOpenTerminalScript", () => {
  function assertValidAppleScript(script: string) {
    execFileSync("osacompile", ["-o", "/dev/null", "-"], { input: script });
  }

  test("produces valid AppleScript for a plain path", () => {
    expect(() => assertValidAppleScript(buildOpenTerminalScript("/Users/dev/awesome-rag-forge"))).not.toThrow();
  });

  test("produces valid AppleScript for a path with a space", () => {
    expect(() => assertValidAppleScript(buildOpenTerminalScript("/Users/dev/awesome rag forge"))).not.toThrow();
  });

  test("produces valid AppleScript for a path with a single quote", () => {
    expect(() => assertValidAppleScript(buildOpenTerminalScript("/Users/dev's-machine/repo"))).not.toThrow();
  });

  test("produces valid AppleScript for a path with a double quote", () => {
    expect(() => assertValidAppleScript(buildOpenTerminalScript('/Users/dev/repo "fork"'))).not.toThrow();
  });
});
