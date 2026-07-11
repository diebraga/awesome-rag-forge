import { describe, expect, test, vi } from "vitest";
import {
  AUTH_SETUP_REQUIRED_ERROR,
  getTestingApiAuthFailure,
  isTestingApiKeyConfigured,
} from "./testing-api-auth";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const previous = {
    APP_API_KEY: process.env.APP_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function requestWithAuthorization(value?: string) {
  return new Request("http://localhost/api/rag", {
    headers: value ? { Authorization: value } : undefined,
  });
}

describe("testing API authentication", () => {
  test("treats a blank APP_API_KEY as unconfigured", () => {
    withEnv({ APP_API_KEY: "   " }, () => {
      expect(isTestingApiKeyConfigured()).toBe(false);
    });
  });

  test("allows local testing requests when no API key is configured", () => {
    withEnv({ APP_API_KEY: undefined, NODE_ENV: "development", VERCEL: undefined }, () => {
      expect(getTestingApiAuthFailure(requestWithAuthorization())).toBeNull();
    });
  });

  test("requires setup before exposing testing APIs on Vercel without an API key", async () => {
    withEnv({ APP_API_KEY: undefined, NODE_ENV: "production", VERCEL: "1" }, async () => {
      const response = getTestingApiAuthFailure(requestWithAuthorization());

      expect(response?.status).toBe(503);
      await expect(response?.json()).resolves.toEqual({
        ok: false,
        error: AUTH_SETUP_REQUIRED_ERROR,
        reason: "missing-api-key",
      });
    });
  });

  test("rejects requests without a bearer token when APP_API_KEY is configured", async () => {
    withEnv({ APP_API_KEY: "local-secret", NODE_ENV: "development", VERCEL: undefined }, async () => {
      const response = getTestingApiAuthFailure(requestWithAuthorization());

      expect(response?.status).toBe(401);
      await expect(response?.json()).resolves.toEqual({
        ok: false,
        error: "Invalid or missing API key.",
        reason: "invalid-api-key",
      });
    });
  });

  test("accepts requests with the configured bearer token", () => {
    withEnv({ APP_API_KEY: "local-secret", NODE_ENV: "development", VERCEL: undefined }, () => {
      expect(getTestingApiAuthFailure(requestWithAuthorization("Bearer local-secret"))).toBeNull();
    });
  });

  test("uses timing-safe comparison for mismatched bearer tokens", () => {
    const timingSpy = vi.spyOn(Buffer, "from");

    withEnv({ APP_API_KEY: "local-secret", NODE_ENV: "development", VERCEL: undefined }, () => {
      const response = getTestingApiAuthFailure(requestWithAuthorization("Bearer wrong-secret"));
      expect(response?.status).toBe(401);
    });

    expect(timingSpy).toHaveBeenCalled();
    timingSpy.mockRestore();
  });
});
