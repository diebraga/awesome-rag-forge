import { prisma } from "@/lib/prisma";
import { embedTextWithOllama, formatPgVectorLiteral } from "@/lib/rag/embeddings";
import { buildApprovedChatChunkWhere } from "@/lib/rag/visibility";

export type RagCitation = {
  documentId: string;
  title: string;
  downloadable: boolean;
};

export type RagContextChunk = {
  id?: string;
  semanticScore?: number;
  chunkText: string;
  sectionTitle: string | null;
  metadata?: unknown;
  updatedAt: Date;
  document: {
    id: string;
    title: string;
    category: string | null;
    domain: string | null;
    tags: string[];
    audience: string;
    visibility: string[];
    storageKey: string | null;
    collection?: {
      name: string;
      category: string | null;
      domain: string | null;
      tags: string[];
      audience: string;
      visibility: string[];
    };
  };
  sources: Array<{
    label: string;
    citationText: string | null;
  }>;
};

const DEFAULT_CONTEXT_LIMIT = 5;
const CANDIDATE_LIMIT = 50;
const SEMANTIC_DISTANCE_THRESHOLD = 0.58;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "tell",
  "the",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
]);

export function normalizeRetrievalText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((word) => normalizeRetrievalText(word))
    .filter((word) => word.length >= 4);
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;

    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function hasNearWordMatch(value: string, term: string): boolean {
  const normalizedTerm = normalizeRetrievalText(term);
  if (normalizedTerm.length < 4) return false;
  return normalizedWords(value).some((word) => editDistanceAtMostOne(word, normalizedTerm));
}

function tokenizeQuery(query?: string): string[] {
  if (!query?.trim()) return [];

  const rawTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const terms = new Set<string>();
  for (const token of rawTokens) {
    terms.add(token);
    const compact = normalizeRetrievalText(token);
    if (compact.length > 1) terms.add(compact);
    // Compact user spellings like "COEse" should still have a chance to
    // find spaced titles like "COES eindex" before the in-memory ranker runs.
    if (compact.length >= 5 && compact.length <= 7) terms.add(compact.slice(0, 4));
    if (compact.length >= 6 && compact.length <= 7) terms.add(compact.slice(0, 5));
  }

  return [...terms];
}

function latestFirst(a: RagContextChunk, b: RagContextChunk) {
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

function textFields(chunk: RagContextChunk) {
  const sourceText = chunk.sources.flatMap((source) => [source.label, source.citationText ?? ""]);
  const collection = chunk.document.collection;
  return {
    title: chunk.document.title,
    section: chunk.sectionTitle ?? "",
    source: sourceText.join(" "),
    metadata: [
      chunk.document.category ?? "",
      chunk.document.domain ?? "",
      ...chunk.document.tags,
      ...getRetrievalAliases(chunk.metadata),
      collection?.name ?? "",
      collection?.category ?? "",
      collection?.domain ?? "",
      ...(collection?.tags ?? []),
    ].join(" "),
    body: chunk.chunkText,
  };
}

function scoreChunk(chunk: RagContextChunk, query?: string) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return chunk.semanticScore ?? 0;

  const fields = textFields(chunk);
  const weightedFields: Array<[keyof ReturnType<typeof textFields>, number]> = [
    ["title", 120],
    ["section", 85],
    ["source", 75],
    ["metadata", 55],
    ["body", 20],
  ];

  let score = chunk.semanticScore ?? 0;
  for (const [field, weight] of weightedFields) {
    const raw = fields[field].toLowerCase();
    const compact = normalizeRetrievalText(fields[field]);
    for (const term of terms) {
      if (compact.includes(normalizeRetrievalText(term))) score += weight;
      if (raw.includes(term.toLowerCase())) score += Math.floor(weight / 4);
      if (hasNearWordMatch(fields[field], term)) score += Math.floor(weight / 2);
    }
  }

  return score;
}

export function rankRagChunksForQuery(chunks: RagContextChunk[], query?: string, limit = DEFAULT_CONTEXT_LIMIT): RagContextChunk[] {
  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || latestFirst(a.chunk, b.chunk));

  if (scored.length > 0) {
    return scored.slice(0, limit).map((item) => item.chunk);
  }

  return [];
}

function getRetrievalAliases(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const aliases = (metadata as { retrievalAliases?: unknown }).retrievalAliases;
  if (!Array.isArray(aliases)) return [];
  return aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0);
}

function buildSearchWhere(query?: string) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return undefined;

  return {
    OR: terms.flatMap((term) => [
      { chunkText: { contains: term, mode: "insensitive" as const } },
      { sectionTitle: { contains: term, mode: "insensitive" as const } },
      { document: { title: { contains: term, mode: "insensitive" as const } } },
      { document: { category: { contains: term, mode: "insensitive" as const } } },
      { document: { domain: { contains: term, mode: "insensitive" as const } } },
      { document: { collection: { name: { contains: term, mode: "insensitive" as const } } } },
      { document: { collection: { category: { contains: term, mode: "insensitive" as const } } } },
      { document: { collection: { domain: { contains: term, mode: "insensitive" as const } } } },
      { sources: { some: { label: { contains: term, mode: "insensitive" as const } } } },
      { sources: { some: { citationText: { contains: term, mode: "insensitive" as const } } } },
    ]),
  };
}

async function fetchCandidateChunks(query?: string): Promise<RagContextChunk[]> {
  const queryWhere = buildSearchWhere(query);
  const chunks = await prisma.ragChunk.findMany({
    where: {
      ...buildApprovedChatChunkWhere(),
      ...(queryWhere ?? {}),
    },
    select: {
      id: true,
      chunkText: true,
      sectionTitle: true,
      metadata: true,
      updatedAt: true,
      document: {
        select: {
          id: true,
          title: true,
          category: true,
          domain: true,
          tags: true,
          audience: true,
          visibility: true,
          storageKey: true,
          collection: {
            select: {
              name: true,
              category: true,
              domain: true,
              tags: true,
              audience: true,
              visibility: true,
            },
          },
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
    take: CANDIDATE_LIMIT,
  });

  return chunks;
}

export function isSemanticDistanceRelevant(distance: number): boolean {
  return Number.isFinite(distance) && distance <= SEMANTIC_DISTANCE_THRESHOLD;
}

type SemanticChunkRow = { id: string; distance: number };

async function fetchSemanticChunkIds(query?: string): Promise<string[]> {
  if (!query?.trim()) return [];

  try {
    const embedding = await embedTextWithOllama(query);
    const vector = formatPgVectorLiteral(embedding);
    const rows = await prisma.$queryRawUnsafe<SemanticChunkRow[]>(
      `SELECT c."id", c."embedding" <=> $1::vector AS distance
       FROM "RagChunk" c
       JOIN "RagDocument" d ON d."id" = c."documentId"
       JOIN "RagCollection" col ON col."id" = d."collectionId"
       WHERE c."status" = 'APPROVED'
         AND d."status" = 'APPROVED'
         AND d."audience" = 'EXTERNAL'::"RagAudience"
         AND 'CHAT'::"RagVisibility" = ANY(d."visibility")
         AND col."audience" = 'EXTERNAL'::"RagAudience"
         AND 'CHAT'::"RagVisibility" = ANY(col."visibility")
         AND c."embedding" IS NOT NULL
       ORDER BY c."embedding" <=> $1::vector
       LIMIT $2`,
      vector,
      CANDIDATE_LIMIT,
    );
    return rows.filter((row) => isSemanticDistanceRelevant(row.distance)).map((row) => row.id);
  } catch {
    return [];
  }
}

async function fetchChunksByIds(ids: string[]): Promise<RagContextChunk[]> {
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, index) => [id, index]));
  const chunks = await prisma.ragChunk.findMany({
    where: {
      id: { in: ids },
      ...buildApprovedChatChunkWhere(),
    },
    select: {
      id: true,
      chunkText: true,
      sectionTitle: true,
      metadata: true,
      updatedAt: true,
      document: {
        select: {
          id: true,
          title: true,
          category: true,
          domain: true,
          tags: true,
          audience: true,
          visibility: true,
          storageKey: true,
          collection: { select: { name: true, category: true, domain: true, tags: true, audience: true, visibility: true } },
        },
      },
      sources: { select: { label: true, citationText: true } },
    },
  });
  return chunks
    .sort((a, b) => (order.get(a.id ?? "") ?? 0) - (order.get(b.id ?? "") ?? 0))
    .map((chunk, index) => ({ ...chunk, semanticScore: Math.max(1, CANDIDATE_LIMIT - index) * 30 }));
}

function mergeChunks(...groups: RagContextChunk[][]): RagContextChunk[] {
  const seen = new Set<string>();
  const merged: RagContextChunk[] = [];
  for (const group of groups) {
    for (const chunk of group) {
      const key = chunk.id ?? `${chunk.document.id}:${chunk.sectionTitle ?? ""}:${chunk.chunkText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(chunk);
    }
  }
  return merged;
}

function renderPromptBlock(chunk: RagContextChunk, index: number) {
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
}

export async function getRagContext(query?: string) {
  const [semanticChunks, lexicalChunks] = await Promise.all([
    fetchSemanticChunkIds(query).then(fetchChunksByIds),
    fetchCandidateChunks(query),
  ]);
  const chunks = rankRagChunksForQuery(mergeChunks(semanticChunks, lexicalChunks), query);

  const promptBlocks = chunks.map((chunk, index) => renderPromptBlock(chunk, index));

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
