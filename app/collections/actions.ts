"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertLocalReviewMode } from "@/lib/local-review-guard";
import { buildArchiveMetadata } from "./archive-policy";

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }
  return value.trim();
}

function revalidateCollectionPaths(collectionId: string) {
  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
}

export async function archiveChunkAction(formData: FormData) {
  assertLocalReviewMode();
  const chunkId = readRequiredString(formData, "chunkId");
  const collectionId = readRequiredString(formData, "collectionId");
  const reason = readRequiredString(formData, "reason");
  const archivedAt = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.ragChunk.findUniqueOrThrow({
      where: { id: chunkId },
      select: { documentId: true, metadata: true },
    });

    await tx.ragChunk.update({
      where: { id: chunkId },
      data: {
        status: "ARCHIVED",
        metadata: buildArchiveMetadata(existing.metadata, reason, archivedAt),
      },
    });

    const remainingApprovedChunks = await tx.ragChunk.count({
      where: { documentId: existing.documentId, status: "APPROVED" },
    });

    if (remainingApprovedChunks === 0) {
      const document = await tx.ragDocument.findUniqueOrThrow({
        where: { id: existing.documentId },
        select: { metadata: true },
      });
      await tx.ragDocument.update({
        where: { id: existing.documentId },
        data: {
          status: "ARCHIVED",
          metadata: buildArchiveMetadata(document.metadata, `Archived automatically after last approved chunk was archived: ${reason}`, archivedAt),
        },
      });
    }
  });

  revalidateCollectionPaths(collectionId);
}

export async function archiveDocumentAction(formData: FormData) {
  assertLocalReviewMode();
  const documentId = readRequiredString(formData, "documentId");
  const collectionId = readRequiredString(formData, "collectionId");
  const reason = readRequiredString(formData, "reason");
  const archivedAt = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.ragDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { metadata: true },
    });

    await tx.ragDocument.update({
      where: { id: documentId },
      data: {
        status: "ARCHIVED",
        metadata: buildArchiveMetadata(existing.metadata, reason, archivedAt),
      },
    });

    await tx.ragChunk.updateMany({
      where: { documentId, status: { not: "ARCHIVED" } },
      data: { status: "ARCHIVED" },
    });
  });

  revalidateCollectionPaths(collectionId);
}
