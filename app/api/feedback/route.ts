import { NextResponse } from "next/server";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
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

export async function POST(request: Request) {
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  try {
    const body = (await request.json()) as FeedbackRequest;

    if (!body.rating || !ALLOWED_RATINGS.has(body.rating)) {
      return NextResponse.json(
        { ok: false, error: `rating must be one of: ${[...ALLOWED_RATINGS].join(", ")}` },
        { status: 400 },
      );
    }

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
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to record feedback.",
      },
      { status: 500 },
    );
  }
}
