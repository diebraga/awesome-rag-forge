import { NextResponse } from "next/server";
import { canSimulateDisconnect, isDevDisconnectSimulated, setDevDisconnectSimulated } from "@/lib/dev-disconnect";
import { getLocalRequestFailure } from "@/lib/local-request-guard";

/**
 * Flips the in-memory "simulate disconnected database" toggle used by the
 * Header's Disconnect button, so a local developer can preview the
 * connection gate (app/connection-gate.tsx) without editing DATABASE_URL
 * and restarting the server. Local-only, non-production-only -- same
 * posture as /api/ollama/start.
 *
 * @swagger
 * /api/dev/toggle-disconnect:
 *   post:
 *     summary: Toggle simulated database disconnect for local UI testing
 *     description: Local-only, non-production. In-memory only, resets on server restart.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Toggled
 *       400:
 *         description: Not available in this environment
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  if (!canSimulateDisconnect()) {
    return NextResponse.json(
      { ok: false, error: "Simulating a disconnect is only available outside production." },
      { status: 400 },
    );
  }

  setDevDisconnectSimulated(!isDevDisconnectSimulated());
  return NextResponse.json({ ok: true, disconnected: isDevDisconnectSimulated() });
}
