import { describe, expect, it } from "vitest";
import { chunkPdfPages, normalizeTextForRag } from "./chunking";

describe("normalizeTextForRag", () => {
  it("compacts OCR/PDF whitespace without dropping content", () => {
    const text = normalizeTextForRag("  This   is  a hyphen-\nated\tline.\nStill same paragraph.\n\n  Next   paragraph.  ");

    expect(text).toBe("This is a hyphenated line. Still same paragraph.\n\nNext paragraph.");
  });

  it("normalizes PDF page text before chunking", () => {
    const chunks = chunkPdfPages([
      { pageNumber: 3, text: "  First   line\nsecond line\n\nFinal   paragraph " },
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      pageNumber: 3,
      chunkText: "First line second line\n\nFinal paragraph",
    });
  });
});
