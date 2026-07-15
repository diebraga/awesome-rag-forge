import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { getCliProvider, isCliAvailable } from "@/lib/cli-providers";

/**
 * @swagger
 * /api/knowledge/resolve-command:
 *   post:
 *     summary: Resolve which program/args the in-app terminal panel should spawn for a provider
 *     description: Local-only. Returns the CLI binary + prompt if installed, or the provider's install command (as argv, no shell) if not -- the frontend passes this straight to the Tauri spawn_pty command.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Resolved program + args + cwd
 *       400:
 *         description: Unknown provider
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  const body = await request.json();
  const provider = getCliProvider(String(body.providerId ?? ""));
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined;
  const available = await isCliAvailable(provider.binary);

  if (available) {
    return NextResponse.json({ ok: true, program: provider.binary, args: prompt ? [prompt] : [], cwd: process.cwd() });
  }

  const [installProgram, ...installArgs] = provider.installCommand.split(" ");
  return NextResponse.json({ ok: true, program: installProgram, args: installArgs, cwd: process.cwd() });
}
