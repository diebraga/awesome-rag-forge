import { prisma } from "@/lib/prisma";
import { getOrSetCached } from "@/lib/ttl-cache";

// Read-only approved-data queries against this project's DATABASE_URL, which
// is commonly a remote host (e.g. Prisma Postgres) rather than localhost --
// each of these otherwise pays a real network round-trip on every single
// page navigation. A short TTL keeps repeat browsing snappy while staying
// fresh enough that an MCP write shows up within a few seconds. See
// lib/database-health.ts for the original case this pattern solved.
const READ_CACHE_TTL_MS = 5000;

/**
 * Approved-data reads for the Collections pages (app/collections/). This is
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
 * a testing tool for the same audience as the chat. The page has a separate
 * local-only archive server action for already-visible approved rows, but
 * these read helpers must never expose non-APPROVED content.
 */

const DEFAULT_PAGE_SIZE = 10;

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  domain: string | null;
  tags: string[];
  audience: string;
  visibility: string[];
  approvedDocumentCount: number;
  approvedChunkCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function listApprovedCollections(page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<{
  collections: CollectionSummary[];
  page: number;
  pageSize: number;
  totalCollections: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 50);

  return getOrSetCached(`collections:list:${safePage}:${safePageSize}`, READ_CACHE_TTL_MS, async () => {
  const where = {
    audience: "EXTERNAL" as const,
    visibility: { has: "CHAT" as const },
    documents: {
      some: {
        status: "APPROVED" as const,
        audience: "EXTERNAL" as const,
        visibility: { has: "CHAT" as const },
      },
    },
  };

  const [totalCollections, collections] = await Promise.all([
    prisma.ragCollection.count({ where }),
    prisma.ragCollection.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      domain: true,
      tags: true,
      audience: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      documents: {
        where: { status: "APPROVED", audience: "EXTERNAL", visibility: { has: "CHAT" } },
        select: {
          chunks: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
    skip: (safePage - 1) * safePageSize,
    take: safePageSize,
  }),
  ]);

  return {
    collections: collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    category: collection.category,
    domain: collection.domain,
    tags: collection.tags,
    audience: collection.audience,
    visibility: collection.visibility,
    approvedDocumentCount: collection.documents.length,
    approvedChunkCount: collection.documents.reduce(
      (sum, document) => sum + document.chunks.length,
      0,
    ),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  })),
    page: safePage,
    pageSize: safePageSize,
    totalCollections,
    totalPages: Math.max(1, Math.ceil(totalCollections / safePageSize)),
  };
  });
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
  audience: string;
  visibility: string[];
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
    audience: string;
    visibility: string[];
    createdAt: Date;
    updatedAt: Date;
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

  return getOrSetCached(`collections:detail:${collectionId}:${safePage}:${safePageSize}`, READ_CACHE_TTL_MS, async () => {
  const collection = await prisma.ragCollection.findFirst({
    where: {
      id: collectionId,
      audience: "EXTERNAL",
      visibility: { has: "CHAT" },
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      domain: true,
      tags: true,
      audience: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!collection) return null;

  const [totalDocuments, documents] = await Promise.all([
    prisma.ragDocument.count({
      where: { collectionId, status: "APPROVED", audience: "EXTERNAL", visibility: { has: "CHAT" } },
    }),
    prisma.ragDocument.findMany({
      where: { collectionId, status: "APPROVED", audience: "EXTERNAL", visibility: { has: "CHAT" } },
      select: {
        id: true,
        title: true,
        category: true,
        domain: true,
        tags: true,
        audience: true,
        visibility: true,
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
  });
}
