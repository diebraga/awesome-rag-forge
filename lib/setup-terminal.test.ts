import { describe, expect, test } from "vitest";
import { canOpenSetupTerminal } from "./setup-terminal";

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
