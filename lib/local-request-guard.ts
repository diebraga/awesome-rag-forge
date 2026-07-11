import { NextResponse } from "next/server";

export const NON_LOCAL_REQUEST_ERROR =
  "This local setup helper only accepts requests from this machine's own browser (localhost).";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  // Host headers arrive as "hostname" or "hostname:port"; URL parsing
  // handles the bracketed IPv6 form too.
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

function isLoopbackOrigin(originHeader: string | null): boolean {
  // Non-browser clients (curl, scripts) send no Origin header — that's
  // fine; this guard exists for cross-site browser requests, which always
  // carry one on POST. "null" is what browsers send for opaque origins
  // (sandboxed iframes, some redirects) — treat it as foreign.
  if (originHeader === null) return true;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(originHeader).hostname);
  } catch {
    return false;
  }
}

/**
 * Guard for the local-only, state-changing Ollama helper routes
 * (install/start/pull). They spawn processes and download models on the
 * host machine, so beyond canAutoStartOllama()'s local-URL/non-production
 * gate they must also refuse requests that didn't come from this machine's
 * own browser: a malicious webpage can blind-POST to http://localhost:3000
 * (CSRF), and DNS rebinding can even make such requests same-origin —
 * which is why the Host header is checked too, not just Origin.
 */
export function getLocalRequestFailure(request: Request): NextResponse | null {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");

  if (isLoopbackHost(host) && isLoopbackOrigin(origin)) {
    return null;
  }

  return NextResponse.json({ ok: false, error: NON_LOCAL_REQUEST_ERROR }, { status: 403 });
}
