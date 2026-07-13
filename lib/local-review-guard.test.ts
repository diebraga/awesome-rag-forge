import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalReviewModeFailure } from "./local-review-guard";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getLocalReviewModeFailure", () => {
  it("allows local review when the testing surface is enabled outside production", () => {
    vi.stubEnv("ENABLE_TESTING_SURFACE", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");

    expect(getLocalReviewModeFailure()).toBeNull();
  });

  it("blocks when the testing surface is disabled", () => {
    vi.stubEnv("ENABLE_TESTING_SURFACE", "false");
    vi.stubEnv("NODE_ENV", "development");

    expect(getLocalReviewModeFailure()).toMatch(/Testing surface is disabled/);
  });

  it("blocks direct DB review actions in production runtimes", () => {
    vi.stubEnv("ENABLE_TESTING_SURFACE", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(getLocalReviewModeFailure()).toMatch(/local development only/);
  });
});
