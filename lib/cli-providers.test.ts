import { describe, expect, test } from "vitest";
import { CLI_PROVIDERS, getCliProvider, isCliAvailable } from "./cli-providers";

describe("CLI_PROVIDERS", () => {
  test("has exactly claude, codex, gemini", () => {
    expect(CLI_PROVIDERS.map((p) => p.id).sort()).toEqual(["claude", "codex", "gemini"]);
  });
});

describe("getCliProvider", () => {
  test("finds a known provider", () => {
    expect(getCliProvider("claude")?.binary).toBe("claude");
  });

  test("returns undefined for an unknown id", () => {
    expect(getCliProvider("nonexistent")).toBeUndefined();
  });
});

describe("isCliAvailable", () => {
  test("true for a binary guaranteed to exist", async () => {
    expect(await isCliAvailable("ls")).toBe(true);
  });

  test("false for a binary that does not exist", async () => {
    expect(await isCliAvailable("definitely-not-a-real-binary-xyz")).toBe(false);
  });
});
