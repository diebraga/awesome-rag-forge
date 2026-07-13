"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertLocalReviewMode } from "@/lib/local-review-guard";
import { embedChunkForApproval, storeChunkEmbedding } from "@/lib/rag/chunk-embeddings";

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }
  return value.trim();
}

export async function approveChunkAction(formData: FormData) {
  assertLocalReviewMode();
  const chunkId = readRequiredString(formData, "chunkId");

  const pendingChunk = await prisma.ragChunk.findUniqueOrThrow({
    where: { id: chunkId },
    select: { chunkText: true, metadata: true },
  });
  const embedding = await embedChunkForApproval(pendingChunk);

  await prisma.$transaction(async (tx) => {
    const chunk = await tx.ragChunk.update({
      where: { id: chunkId },
      data: { status: "APPROVED" },
    });
    await storeChunkEmbedding(tx, chunk.id, embedding);
    await tx.ragDocument.updateMany({
      where: { id: chunk.documentId, status: { not: "APPROVED" } },
      data: { status: "APPROVED" },
    });
    await tx.ragReview.create({
      data: {
        chunkId,
        documentId: chunk.documentId,
        status: "APPROVED",
        reviewer: "local-review-ui",
        notes: "Approved from the local review UI.",
        reviewedAt: new Date(),
      },
    });
  });

  revalidatePath("/review");
}

export async function rejectChunkAction(formData: FormData) {
  assertLocalReviewMode();
  const chunkId = readRequiredString(formData, "chunkId");
  const notes = readRequiredString(formData, "notes");

  await prisma.$transaction(async (tx) => {
    const chunk = await tx.ragChunk.update({
      where: { id: chunkId },
      data: { status: "REJECTED" },
    });
    await tx.ragReview.create({
      data: {
        chunkId,
        documentId: chunk.documentId,
        status: "REJECTED",
        reviewer: "local-review-ui",
        notes,
        reviewedAt: new Date(),
      },
    });
  });

  revalidatePath("/review");
}

export async function approveHarnessRuleAction(formData: FormData) {
  assertLocalReviewMode();
  const ruleId = readRequiredString(formData, "ruleId");

  await prisma.harnessRule.update({
    where: { id: ruleId },
    data: {
      status: "APPROVED",
      reviewer: "local-review-ui",
      reviewNotes: "Approved from the local review UI.",
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/review");
}

export async function rejectHarnessRuleAction(formData: FormData) {
  assertLocalReviewMode();
  const ruleId = readRequiredString(formData, "ruleId");
  const reviewNotes = readRequiredString(formData, "reviewNotes");

  await prisma.harnessRule.update({
    where: { id: ruleId },
    data: {
      status: "REJECTED",
      reviewer: "local-review-ui",
      reviewNotes,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/review");
}
