const MAX_CHUNK_CHARS = 1600;
const MIN_PARAGRAPH_CHARS = 40;

export type ProposedChunk = {
  chunkIndex: number;
  chunkText: string;
  sectionTitle?: string;
  tokenCount: number;
  pageNumber?: number;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.3));
}

function cleanParagraphs(sourceText: string) {
  return sourceText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= MIN_PARAGRAPH_CHARS);
}

function maybeSectionTitle(text: string) {
  const firstLine = text.split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  if (firstLine.length > 90) return undefined;
  if (/[.!?]$/.test(firstLine)) return undefined;
  return firstLine;
}

export function chunkSourceText(sourceText: string): ProposedChunk[] {
  const paragraphs = cleanParagraphs(sourceText);
  const chunks: ProposedChunk[] = [];
  let current = "";
  let sectionTitle: string | undefined;

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_CHUNK_CHARS && current) {
      chunks.push({
        chunkIndex: chunks.length,
        chunkText: current,
        sectionTitle,
        tokenCount: estimateTokens(current),
      });
      current = paragraph;
      sectionTitle = maybeSectionTitle(paragraph);
    } else {
      current = next;
      sectionTitle = sectionTitle ?? maybeSectionTitle(paragraph);
    }
  }

  if (current) {
    chunks.push({
      chunkIndex: chunks.length,
      chunkText: current,
      sectionTitle,
      tokenCount: estimateTokens(current),
    });
  }

  return chunks.length > 0
    ? chunks
    : [
        {
          chunkIndex: 0,
          chunkText: sourceText.trim(),
          tokenCount: estimateTokens(sourceText),
        },
      ];
}

export type ExtractedPageInput = {
  pageNumber: number;
  text: string;
};

// Chunks per-page PDF text while keeping pageNumber on every chunk, so
// citations can point at the exact page instead of just the document.
// A page longer than MAX_CHUNK_CHARS is split like chunkSourceText does;
// short pages are kept as their own chunk rather than merged across page
// boundaries, since the page number would otherwise become ambiguous.
export function chunkPdfPages(pages: ExtractedPageInput[]): ProposedChunk[] {
  const chunks: ProposedChunk[] = [];

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    const paragraphs = text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    let current = "";
    for (const paragraph of paragraphs.length > 0 ? paragraphs : [text]) {
      const next = current ? `${current}\n\n${paragraph}` : paragraph;
      if (next.length > MAX_CHUNK_CHARS && current) {
        chunks.push({
          chunkIndex: chunks.length,
          chunkText: current,
          sectionTitle: maybeSectionTitle(current),
          tokenCount: estimateTokens(current),
          pageNumber: page.pageNumber,
        });
        current = paragraph;
      } else {
        current = next;
      }
    }

    if (current) {
      chunks.push({
        chunkIndex: chunks.length,
        chunkText: current,
        sectionTitle: maybeSectionTitle(current),
        tokenCount: estimateTokens(current),
        pageNumber: page.pageNumber,
      });
    }
  }

  return chunks;
}
