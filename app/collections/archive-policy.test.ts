import { describe, expect, it } from "vitest";
import { buildArchiveMetadata, getArchiveWarning } from "./archive-policy";

describe("buildArchiveMetadata", () => {
  it("preserves existing object metadata and adds archive audit fields", () => {
    expect(buildArchiveMetadata({ source: "pdf" }, "duplicate", "2026-07-13T12:00:00.000Z")).toEqual({
      source: "pdf",
      archivedBy: "local-collections-ui",
      archivedReason: "duplicate",
      archivedAt: "2026-07-13T12:00:00.000Z",
    });
  });

  it("starts fresh when existing metadata is not an object", () => {
    expect(buildArchiveMetadata(null, "outdated", "2026-07-13T12:00:00.000Z")).toEqual({
      archivedBy: "local-collections-ui",
      archivedReason: "outdated",
      archivedAt: "2026-07-13T12:00:00.000Z",
    });
  });
});

describe("getArchiveWarning", () => {
  it("explains chunk archival impact", () => {
    expect(getArchiveWarning("chunk")).toContain("This chunk will stop appearing in chat retrieval");
  });

  it("explains document archival impact", () => {
    expect(getArchiveWarning("document")).toContain("This document and all of its chunks");
  });
});
