import { NextResponse } from "next/server";

/**
 * Never return a raw caught error's message to the client, and never print
 * one to server logs unredacted either — a Prisma/pg connection failure's
 * message can embed the full DATABASE_URL (credentials included), and an S3
 * SDK failure can embed bucket/endpoint details. Every route should catch
 * unexpected errors with routeErrorResponse() and supply its own
 * situation-specific fallback message; known, anticipated conditions
 * (validation failures, not-found, disabled features) should still return
 * their own specific message directly — this helper is only the last-resort
 * generic-error path, not a replacement for those.
 */

const SENSITIVE_PATTERNS: RegExp[] = [
  // Connection strings with embedded credentials (postgres://user:pass@host).
  /\b\w+:\/\/[^\s"'@/]+:[^\s"'@/]+@[^\s"']+/gi,
  // Common secret/token prefixes (Prisma "sk_", Cloudflare "cfat_", AWS access keys).
  /\bsk_[A-Za-z0-9_-]+/gi,
  /\bcfat_[A-Za-z0-9]+/gi,
  /\bAKIA[0-9A-Z]{16}\b/gi,
];

function sanitize(message: string): string {
  let result = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return sanitize(error.message);
  if (typeof error === "string") return sanitize(error);
  return "non-Error value thrown";
}

/** Server-side only — never sent to the client. */
export function logRouteError(context: string, error: unknown) {
  console.error(`[${context}]`, describeError(error));
}

/**
 * The generic, last-resort error response: logs a sanitized description
 * server-side, returns only the caller-supplied fallback message to the
 * client. `fallbackMessage` should describe the situation (what the route
 * was trying to do), not the underlying cause — the specific cause stays
 * server-side.
 */
export function routeErrorResponse(context: string, error: unknown, fallbackMessage: string, status = 500) {
  logRouteError(context, error);
  return NextResponse.json({ ok: false, error: fallbackMessage }, { status });
}
