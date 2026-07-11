import { describe, expect, test } from "vitest";
import { getLocalRequestFailure, NON_LOCAL_REQUEST_ERROR } from "./local-request-guard";

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/ollama/start", {
    method: "POST",
    headers,
  });
}

describe("local request guard", () => {
  test("allows same-machine browser requests (loopback host + loopback origin)", () => {
    expect(
      getLocalRequestFailure(requestWith({ host: "localhost:3000", origin: "http://localhost:3000" })),
    ).toBeNull();
  });

  test("allows 127.0.0.1 and IPv6 loopback hosts", () => {
    expect(
      getLocalRequestFailure(requestWith({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" })),
    ).toBeNull();
    expect(
      getLocalRequestFailure(requestWith({ host: "[::1]:3000", origin: "http://[::1]:3000" })),
    ).toBeNull();
  });

  test("allows non-browser clients that send no Origin header", () => {
    expect(getLocalRequestFailure(requestWith({ host: "localhost:3000" }))).toBeNull();
  });

  test("rejects cross-site browser requests (foreign origin)", async () => {
    const response = getLocalRequestFailure(
      requestWith({ host: "localhost:3000", origin: "https://evil.example" }),
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: NON_LOCAL_REQUEST_ERROR });
  });

  test("rejects DNS-rebinding requests (foreign host, even with matching origin)", () => {
    const response = getLocalRequestFailure(
      requestWith({ host: "rebound.attacker.example", origin: "http://rebound.attacker.example" }),
    );
    expect(response?.status).toBe(403);
  });

  test('rejects the opaque "null" origin', () => {
    const response = getLocalRequestFailure(requestWith({ host: "localhost:3000", origin: "null" }));
    expect(response?.status).toBe(403);
  });

  test("rejects requests with no Host header", () => {
    const request = new Request("http://localhost:3000/api/ollama/start", { method: "POST" });
    request.headers.delete("host");
    const response = getLocalRequestFailure(request);
    expect(response?.status).toBe(403);
  });
});
