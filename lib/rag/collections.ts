import { prisma } from "@/lib/prisma";

/**
 * Read-only data for the Collections pages (app/collections/). This is
 * part of the same end-user-facing, read-only surface as the chat — it
 * uses the exact same APPROVED-only visibility as lib/rag/retrieval.ts and
 * lib/rag/chat-context.ts. Showing collection/document names here is a
 * deliberate, explicit feature (the whole point of this page), not a
 * contradiction of the chat's restriction against narrating its own
 * structure in conversation — that restriction governs conversational
 * behavior in lib/rag/chat-context.ts, not this page. See
 * docs/architecture.md and docs/security.md.
 *
 * Never expose DRAFT/PENDING_REVIEW/REJECTED/ARCHIVED content here. This is
 * a testing tool for the same audience as the chat, not the MCP server's
 * creator-facing surface.
 */

const DEFAULT_PAGE_SIZE = 10;

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  domain: string | null;
  tags: string[];
  approvedDocumentCount: number;
  approvedChunkCount: number;
};

export async function listApprovedCollections(): Promise<CollectionSummary[]> {
  const collections = await prisma.ragCollection.findMany({
    where: {
      documents: {
        some: { status: "APPROVED" },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      domain: true,
      tags: true,
      documents: {
        where: { status: "APPROVED" },
        select: {
          chunks: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    category: collection.category,
    domain: collection.domain,
    tags: collection.tags,
    approvedDocumentCount: collection.documents.length,
    approvedChunkCount: collection.documents.reduce(
      (sum, document) => sum + document.chunks.length,
      0,
    ),
  }));
}

export type CollectionDetailChunk = {
  id: string;
  chunkText: string;
  sectionTitle: string | null;
  chunkIndex: number;
};

export type CollectionDetailDocument = {
  id: string;
  title: string;
  category: string | null;
  domain: string | null;
  tags: string[];
  sourceType: string;
  chunks: CollectionDetailChunk[];
};

export type CollectionDetail = {
  collection: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    domain: string | null;
    tags: string[];
  };
  documents: CollectionDetailDocument[];
  page: number;
  pageSize: number;
  totalDocuments: number;
  totalPages: number;
};

export async function getCollectionDetail(
  collectionId: string,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<CollectionDetail | null> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 50);

  const collection = await prisma.ragCollection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      domain: true,
      tags: true,
    },
  });

  if (!collection) return null;

  const [totalDocuments, documents] = await Promise.all([
    prisma.ragDocument.count({
      where: { collectionId, status: "APPROVED" },
    }),
    prisma.ragDocument.findMany({
      where: { collectionId, status: "APPROVED" },
      select: {
        id: true,
        title: true,
        category: true,
        domain: true,
        tags: true,
        sourceType: true,
        chunks: {
          where: { status: "APPROVED" },
          select: {
            id: true,
            chunkText: true,
            sectionTitle: true,
            chunkIndex: true,
          },
          orderBy: { chunkIndex: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
  ]);

  return {
    collection,
    documents,
    page: safePage,
    pageSize: safePageSize,
    totalDocuments,
    totalPages: Math.max(1, Math.ceil(totalDocuments / safePageSize)),
  };
}
