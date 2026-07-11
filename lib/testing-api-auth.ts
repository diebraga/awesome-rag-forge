import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const AUTH_SETUP_REQUIRED_ERROR =
  "Testing API authentication is not configured. Set APP_API_KEY before exposing ENABLE_TESTING_SURFACE=true on a deployed app.";

export const AUTH_REQUIRED_ERROR = "Invalid or missing API key.";

function getConfiguredTestingApiKey() {
  const key = process.env.APP_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isTestingApiKeyConfigured() {
  return getConfiguredTestingApiKey() !== null;
}

export function isPublicDeploymentRuntime() {
  // Any production build counts as deployed, not just Vercel — a Docker/VPS
  // deployment with ENABLE_TESTING_SURFACE=true must fail closed the same
  // way. A local `next build && next start` smoke test also lands here;
  // set APP_API_KEY for it rather than widening this check.
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
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

export function getTestingApiAuthFailure(request: Request) {
  const configuredKey = getConfiguredTestingApiKey();

  if (!configuredKey) {
    if (!isPublicDeploymentRuntime()) return null;

    return NextResponse.json(
      { ok: false, error: AUTH_SETUP_REQUIRED_ERROR, reason: "missing-api-key" },
      { status: 503 },
    );
  }

  const suppliedToken = readBearerToken(request);
  if (suppliedToken && constantTimeEquals(suppliedToken, configuredKey)) {
    return null;
  }

  return NextResponse.json(
    { ok: false, error: AUTH_REQUIRED_ERROR, reason: "invalid-api-key" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="awesome-rag-forge-testing-api"' },
    },
  );
}
