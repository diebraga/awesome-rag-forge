import { NextResponse } from "next/server";
import { logRouteError } from "@/lib/api-errors";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import {
  canOpenSetupTerminal,
  openSetupTerminal,
  SETUP_TERMINAL_UNAVAILABLE_ERROR,
} from "@/lib/setup-terminal";

/**
 * Opens a terminal running `npm run setup` on this machine. Deliberately
 * does NOT go through getTestingApiReadinessFailure() like other local
 * routes: that helper requires the database to already be reachable, which
 * defeats the purpose here — this route exists specifically for the moment
 * the database is NOT yet configured or reachable, before
 * ENABLE_TESTING_SURFACE or APP_API_KEY are necessarily set up either. The
 * local-request guard (loopback host + origin) is the only gate that still
 * applies, matching the Ollama helper routes' CSRF/DNS-rebinding
 * protection.
 *
 * @swagger
 * /api/setup/open-terminal:
 *   post:
 *     summary: Open a terminal running `npm run setup` on this machine
 *     description: Local-only, macOS-only, non-production. Never targets any machine other than the one this server process is already running on.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Terminal opened
 *       400:
 *         description: Not available on this platform/environment
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       500:
 *         description: Failed to open a terminal
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  if (!canOpenSetupTerminal()) {
    return NextResponse.json({ ok: false, error: SETUP_TERMINAL_UNAVAILABLE_ERROR }, { status: 400 });
  }

  try {
    await openSetupTerminal();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("POST /api/setup/open-terminal", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to open a terminal." },
      { status: 500 },
    );
  }
}
