import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { getCliProvider, isCliAvailable } from "@/lib/cli-providers";
import { writeToInbox, RAG_INBOX_DIRNAME } from "@/lib/rag-inbox";
import {
  canOpenProviderTerminal,
  openTerminalWithCommand,
  shellQuoteSingleArg,
  PROVIDER_TERMINAL_UNAVAILABLE_ERROR,
} from "@/lib/provider-terminal";

/**
 * @swagger
 * /api/knowledge/add:
 *   post:
 *     summary: Stage picked files and open a terminal running the chosen AI CLI
 *     description: Local-only, non-production, macOS-only. Writes uploaded files to .rag-inbox/, then opens Terminal.app running the CLI (primed to add those files) or, if the CLI isn't installed, its install command.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Terminal opened
 *       400:
 *         description: Not available in this environment, unknown provider, or no files
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 *       500:
 *         description: Terminal failed to open
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  if (!canOpenProviderTerminal()) {
    return NextResponse.json({ ok: false, error: PROVIDER_TERMINAL_UNAVAILABLE_ERROR }, { status: 400 });
  }

  const formData = await request.formData();
  const provider = getCliProvider(String(formData.get("provider") ?? ""));
  if (!provider) {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Select at least one file." }, { status: 400 });
  }

  const staged = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: Buffer.from(await file.arrayBuffer()) })),
  );
  writeToInbox(staged);

  const available = await isCliAvailable(provider.binary);
  try {
    if (available) {
      const prompt = `Add the files in ${RAG_INBOX_DIRNAME}/ to the knowledge base.`;
      await openTerminalWithCommand(`${provider.binary} ${shellQuoteSingleArg(prompt)}`);
    } else {
      await openTerminalWithCommand(provider.installCommand);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to open a terminal window." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, installing: !available });
}
