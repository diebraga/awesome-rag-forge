import { NextResponse } from "next/server";
import { getTestingApiReadinessFailure } from "@/lib/api-readiness";
import { routeErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

/**
 * A narrow, deliberate exception to "the chat app never writes" (see
 * docs/architecture.md and CLAUDE.md's non-negotiable rules). This route can
 * ONLY ever create a RagFeedback row — an end user's reaction to an answer,
 * not a change to the knowledge base itself. It has no path to
 * RagChunk/RagDocument/HarnessRule and must never gain one; if a future
 * change would let this route touch those tables, that change belongs in
 * the MCP server instead, gated the same way every other knowledge write is.
 */

type FeedbackRequest = {
  question?: string;
  answer?: string;
  rating?: string;
  documentIds?: string[];
};

const ALLOWED_RATINGS = new Set(["GOOD", "BAD"]);

// Keep stored text bounded — this is a lightweight reaction record, not a
// place to accumulate unbounded user input.
const MAX_TEXT_LENGTH = 4000;

function truncate(value: string | undefined) {
  if (!value) return undefined;
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Record a thumbs up/down reaction to an answer
 *     description: The one narrow, deliberate exception to "the chat app never writes" — this route can only create a RagFeedback row from an end-user reaction. Feedback review, resolution, eval creation, and any follow-up knowledge or harness changes remain MCP-only.
 *     tags: [Feedback]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               question: { type: string }
 *               answer: { type: string }
 *               rating: { type: string, enum: [GOOD, BAD] }
 *               documentIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: Cited source document IDs, capped at 10.
 *     responses:
 *       200:
 *         description: Feedback recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 id: { type: string }
 *       400:
 *         description: Invalid body or unrecognized rating
 *       401:
 *         description: Missing/invalid API key (only when APP_API_KEY is configured)
 *       404:
 *         description: Testing surface disabled
 *       503:
 *         description: Database unreachable
 */
export async function POST(request: Request) {
  const readinessFailure = await getTestingApiReadinessFailure(request);

  if (readinessFailure) {
    return readinessFailure;
  }

  let body: FeedbackRequest;
  try {
    body = (await request.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body — expected JSON." }, { status: 400 });
  }

  if (!body.rating || !ALLOWED_RATINGS.has(body.rating)) {
    return NextResponse.json(
      { ok: false, error: `rating must be one of: ${[...ALLOWED_RATINGS].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const documentIds = Array.isArray(body.documentIds)
      ? body.documentIds.filter((id): id is string => typeof id === "string").slice(0, 10)
      : undefined;

    const feedback = await prisma.ragFeedback.create({
      data: {
        question: truncate(body.question),
        answer: truncate(body.answer),
        rating: body.rating as "GOOD" | "BAD",
        metadata: documentIds && documentIds.length > 0 ? { citedDocumentIds: documentIds } : undefined,
      },
    });

    return NextResponse.json({ ok: true, id: feedback.id });
  } catch (error) {
    return routeErrorResponse("POST /api/feedback", error, "Unable to record feedback.");
  }
}
