const MAX_CHUNK_CHARS = 1600;
const MIN_PARAGRAPH_CHARS = 40;

export type ProposedChunk = {
  chunkIndex: number;
  chunkText: string;
  sectionTitle?: string;
  tokenCount: number;
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
