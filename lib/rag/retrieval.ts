import { prisma } from "@/lib/prisma";

export type RagCitation = {
  documentId: string;
  title: string;
  downloadable: boolean;
};

export async function getRagContext() {
  const chunks = await prisma.ragChunk.findMany({
    where: {
      status: "APPROVED",
      document: {
        status: "APPROVED",
      },
    },
    select: {
      chunkText: true,
      sectionTitle: true,
      document: {
        select: {
          id: true,
          title: true,
          category: true,
          domain: true,
          storageKey: true,
        },
      },
      sources: {
        select: {
          label: true,
          citationText: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 5,
  });

  const promptBlocks = chunks.map((chunk, index) => {
    const source = chunk.sources[0];
    return [
      `Source ${index + 1}: ${source?.label ?? chunk.document.title}`,
      `Title: ${chunk.document.title}`,
      chunk.document.category ? `Category: ${chunk.document.category}` : null,
      chunk.document.domain ? `Domain: ${chunk.document.domain}` : null,
      chunk.sectionTitle ? `Section: ${chunk.sectionTitle}` : null,
      source?.citationText ? `Citation: ${source.citationText}` : null,
      `Text: ${chunk.chunkText}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const citations: RagCitation[] = [];
  const seenDocumentIds = new Set<string>();
  for (const chunk of chunks) {
    if (seenDocumentIds.has(chunk.document.id)) continue;
    seenDocumentIds.add(chunk.document.id);
    citations.push({
      documentId: chunk.document.id,
      title: chunk.document.title,
      downloadable: chunk.document.storageKey !== null,
    });
  }

  return { promptBlocks, citations };
}
