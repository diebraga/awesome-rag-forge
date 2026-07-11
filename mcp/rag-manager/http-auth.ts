import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function generateAuthToken() {
  return randomBytes(32).toString("hex");
}

export function extractBearerToken(req: IncomingMessage) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1) return null;

  return rest[0] || null;
}

function constantTimeEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export type AuthCheckResult = { ok: true } | { ok: false; reason: "missing-token" | "invalid-token" };

export function checkAuth(req: IncomingMessage, expectedToken: string): AuthCheckResult {
  const suppliedToken = extractBearerToken(req);
  if (!suppliedToken) return { ok: false, reason: "missing-token" };

  if (!constantTimeEquals(suppliedToken, expectedToken)) {
    return { ok: false, reason: "invalid-token" };
  }

  return { ok: true };
}
