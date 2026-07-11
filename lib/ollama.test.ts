import { describe, expect, test } from "vitest";
import { getOllamaInstallPlan } from "./ollama";

describe("Ollama install plan", () => {
  test("uses Homebrew on macOS when brew is available", () => {
    expect(getOllamaInstallPlan({ platform: "darwin", hasBrew: true })).toEqual({
      ok: true,
      command: "brew",
      args: ["install", "ollama"],
    });
  });

  test("returns clear manual instructions when automatic install is unsupported", () => {
    const plan = getOllamaInstallPlan({ platform: "linux", hasBrew: false });

    expect(plan.ok).toBe(false);
    expect(plan.message).toContain("Install Ollama manually");
  });
});
