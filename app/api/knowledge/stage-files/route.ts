import { NextResponse } from "next/server";
import { getLocalRequestFailure } from "@/lib/local-request-guard";
import { writeToInbox } from "@/lib/rag-inbox";

/**
 * @swagger
 * /api/knowledge/stage-files:
 *   post:
 *     summary: Stage files attached in the terminal panel's composer into .rag-inbox/
 *     description: Local-only. Writes uploaded files flat into .rag-inbox/ and returns their saved names, so the frontend can build the "New files added" message sent into the live PTY session.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Files staged
 *       400:
 *         description: No files provided
 *       403:
 *         description: Request did not originate from this machine's own browser (localhost-only guard)
 */
export async function POST(request: Request) {
  const localFailure = getLocalRequestFailure(request);
  if (localFailure) return localFailure;

  const formData = await request.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 });
  }

  const staged = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: Buffer.from(await file.arrayBuffer()) })),
  );
  writeToInbox(staged);

  return NextResponse.json({ ok: true, files: staged.map((file) => file.name.replace(/[\\/]/g, "_")) });
}
