import { prisma } from "@/lib/prisma";

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
          title: true,
          category: true,
          domain: true,
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

  return chunks.map((chunk, index) => {
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
}
