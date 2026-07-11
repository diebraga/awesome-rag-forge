import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { checkAuth, extractBearerToken, generateAuthToken } from "./http-auth";

function fakeRequest(authorizationHeader: string | undefined): IncomingMessage {
  return { headers: { authorization: authorizationHeader } } as IncomingMessage;
}

describe("generateAuthToken", () => {
  it("generates a 64-char hex token", () => {
    const token = generateAuthToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a different token each call", () => {
    expect(generateAuthToken()).not.toBe(generateAuthToken());
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken(fakeRequest("Bearer abc123"))).toBe("abc123");
  });

  it("returns null when the header is missing", () => {
    expect(extractBearerToken(fakeRequest(undefined))).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearerToken(fakeRequest("Basic abc123"))).toBeNull();
  });

  it("returns null when the token is empty", () => {
    expect(extractBearerToken(fakeRequest("Bearer"))).toBeNull();
  });

  it("returns null when there are extra segments", () => {
    expect(extractBearerToken(fakeRequest("Bearer abc123 extra"))).toBeNull();
  });
});

describe("checkAuth", () => {
  const expectedToken = "correct-token-value";

  it("passes with the correct token", () => {
    expect(checkAuth(fakeRequest(`Bearer ${expectedToken}`), expectedToken)).toEqual({ ok: true });
  });

  it("fails with a missing header", () => {
    expect(checkAuth(fakeRequest(undefined), expectedToken)).toEqual({
      ok: false,
      reason: "missing-token",
    });
  });

  it("fails with the wrong token", () => {
    expect(checkAuth(fakeRequest("Bearer wrong-token"), expectedToken)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });

  it("fails with a token of different length (no length-based timing leak crash)", () => {
    expect(checkAuth(fakeRequest("Bearer short"), expectedToken)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });
});
