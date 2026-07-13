export type ArchiveTarget = "chunk" | "document";

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildArchiveMetadata(existingMetadata: unknown, reason: string, archivedAt = new Date().toISOString()) {
  return {
    ...(isMetadataObject(existingMetadata) ? existingMetadata : {}),
    archivedBy: "local-collections-ui",
    archivedReason: reason,
    archivedAt,
  };
}

export function getArchiveWarning(target: ArchiveTarget) {
  if (target === "document") {
    return "This document and all of its chunks will stop appearing in chat retrieval and collection browsing. Database rows are preserved for audit history.";
  }

  return "This chunk will stop appearing in chat retrieval and collection browsing. If it is the last approved chunk in the document, the document will also leave the approved collection view.";
}
