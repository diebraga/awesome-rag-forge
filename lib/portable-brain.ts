import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";

export const PORTABLE_BRAIN_SNAPSHOT_VERSION = 1;

export const BRAIN_TABLES = [
  "KnowledgeScope",
  "RagCollection",
  "RagDocument",
  "RagChunk",
  "RagSource",
  "RagFeedback",
  "RagReview",
  "AssistantConfig",
  "HarnessRule",
  "RagEvalCase",
] as const;

const rowSchema = z.record(z.string(), z.unknown());
const rowListSchema = z.array(rowSchema);

export const portableBrainSnapshotSchema = z.object({
  kind: z.literal("awesome-rag-forge.portable-brain"),
  version: z.literal(PORTABLE_BRAIN_SNAPSHOT_VERSION),
  exportedAt: z.string(),
  options: z.object({
    includePendingReview: z.boolean(),
    includeFeedbackAndReviews: z.boolean(),
    includeEmbeddings: z.literal(false),
  }),
  warnings: z.array(z.string()),
  data: z.object({
    knowledgeScopes: rowListSchema,
    ragCollections: rowListSchema,
    ragDocuments: rowListSchema,
    ragChunks: rowListSchema,
    ragSources: rowListSchema,
    ragFeedback: rowListSchema,
    ragReviews: rowListSchema,
    assistantConfigs: rowListSchema,
    harnessRules: rowListSchema,
    ragEvalCases: rowListSchema,
  }),
});

export type PortableBrainSnapshot = z.infer<typeof portableBrainSnapshotSchema>;
export type PortableBrainImportMode = "skip" | "upsert";

export type PortableBrainSummary = {
  scopes: number;
  collections: number;
  documents: number;
  chunks: number;
  sources: number;
  feedback: number;
  reviews: number;
  assistantConfigs: number;
  harnessRules: number;
  evalCases: number;
};

export type PortableBrainStats = PortableBrainSummary & {
  postgresVersion: string | null;
  pgvectorInstalled: boolean;
  installedTables: string[];
  missingTables: string[];
};

type BrainRow = Record<string, unknown>;
type PrismaReadDelegate = {
  count(): Promise<number>;
  findMany(args?: unknown): Promise<BrainRow[]>;
};
type PrismaWriteDelegate = PrismaReadDelegate & {
  createMany(args: { data: BrainRow[]; skipDuplicates?: boolean }): Promise<unknown>;
  upsert(args: { where: { id: string }; create: BrainRow; update: BrainRow }): Promise<unknown>;
};
type PortablePrismaModels = {
  knowledgeScope: PrismaWriteDelegate;
  ragCollection: PrismaWriteDelegate;
  ragDocument: PrismaWriteDelegate;
  ragChunk: PrismaWriteDelegate;
  ragSource: PrismaWriteDelegate;
  ragFeedback: PrismaWriteDelegate;
  ragReview: PrismaWriteDelegate;
  assistantConfig: PrismaWriteDelegate;
  harnessRule: PrismaWriteDelegate;
  ragEvalCase: PrismaWriteDelegate;
};

function asPortablePrisma(prisma: PrismaClient) {
  return prisma as unknown as PrismaClient & PortablePrismaModels;
}

async function countRows(prisma: PrismaClient, tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `select count(*) as count from "${tableName}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

const idFrom = (row: BrainRow) => (typeof row.id === "string" ? row.id : null);

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function quoteSqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function idSet(rows: BrainRow[]) {
  return new Set(rows.map(idFrom).filter((id): id is string => Boolean(id)));
}

function rowReferences(row: BrainRow, key: string, ids: Set<string>) {
  const value = row[key];
  return typeof value === "string" && ids.has(value);
}

function nullableReferenceOk(row: BrainRow, key: string, ids: Set<string>) {
  const value = row[key];
  return value == null || (typeof value === "string" && ids.has(value));
}

export function parsePortableBrainSnapshot(input: unknown) {
  return portableBrainSnapshotSchema.parse(input);
}

export function summarizePortableBrainSnapshot(snapshot: PortableBrainSnapshot): PortableBrainSummary {
  return {
    scopes: snapshot.data.knowledgeScopes.length,
    collections: snapshot.data.ragCollections.length,
    documents: snapshot.data.ragDocuments.length,
    chunks: snapshot.data.ragChunks.length,
    sources: snapshot.data.ragSources.length,
    feedback: snapshot.data.ragFeedback.length,
    reviews: snapshot.data.ragReviews.length,
    assistantConfigs: snapshot.data.assistantConfigs.length,
    harnessRules: snapshot.data.harnessRules.length,
    evalCases: snapshot.data.ragEvalCases.length,
  };
}

export async function getPortableBrainStats(prisma: PrismaClient): Promise<PortableBrainStats> {
  const tableList = BRAIN_TABLES.map(quoteSqlLiteral).join(", ");
  const [versionRows, vectorRows, tableRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ version: string }>>("select version() as version"),
    prisma.$queryRawUnsafe<Array<{ extname: string }>>("select extname from pg_extension where extname = 'vector'"),
    prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name in (${tableList})`,
    ),
  ]);

  const installedTables = tableRows.map((row) => row.table_name).sort();
  const installed = new Set(installedTables);
  const counts = await Promise.all(BRAIN_TABLES.map((table) => (installed.has(table) ? countRows(prisma, table) : 0)));

  return {
    postgresVersion: versionRows[0]?.version ?? null,
    pgvectorInstalled: vectorRows.length > 0,
    installedTables,
    missingTables: BRAIN_TABLES.filter((table) => !installed.has(table)),
    scopes: counts[0],
    collections: counts[1],
    documents: counts[2],
    chunks: counts[3],
    sources: counts[4],
    feedback: counts[5],
    reviews: counts[6],
    assistantConfigs: counts[7],
    harnessRules: counts[8],
    evalCases: counts[9],
  };
}

export async function createPortableBrainSnapshot(
  prisma: PrismaClient,
  options: { includePendingReview?: boolean; includeFeedbackAndReviews?: boolean } = {},
): Promise<PortableBrainSnapshot> {
  const db = asPortablePrisma(prisma);
  const statuses = options.includePendingReview ? ["APPROVED", "PENDING_REVIEW"] : ["APPROVED"];

  const knowledgeScopes = await db.knowledgeScope.findMany({ orderBy: { createdAt: "asc" } });
  const ragCollections = await db.ragCollection.findMany({ orderBy: { createdAt: "asc" } });
  const ragDocuments = await db.ragDocument.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "asc" },
  });
  const documentIds = idSet(ragDocuments);
  const ragChunks = await db.ragChunk.findMany({
    where: { documentId: { in: [...documentIds] }, status: { in: statuses } },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
  });
  const chunkIds = idSet(ragChunks);
  const ragSources = await db.ragSource.findMany({
    where: {
      documentId: { in: [...documentIds] },
      OR: [{ chunkId: null }, { chunkId: { in: [...chunkIds] } }],
    },
    orderBy: { createdAt: "asc" },
  });
  const assistantConfigs = await db.assistantConfig.findMany({ orderBy: { createdAt: "asc" } });
  const harnessRules = await db.harnessRule.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "asc" },
  });
  const ragEvalCases = await db.ragEvalCase.findMany({
    where: { OR: [{ collectionId: null }, { collectionId: { in: [...idSet(ragCollections)] } }] },
    orderBy: { createdAt: "asc" },
  });

  const [ragFeedback, ragReviews] = options.includeFeedbackAndReviews
    ? await Promise.all([
        db.ragFeedback.findMany({
          where: {
            OR: [
              { documentId: { in: [...documentIds] }, chunkId: null },
              { chunkId: { in: [...chunkIds] } },
              { documentId: null, chunkId: null },
            ],
          },
          orderBy: { createdAt: "asc" },
        }),
        db.ragReview.findMany({
          where: {
            OR: [
              { documentId: { in: [...documentIds] }, chunkId: null },
              { chunkId: { in: [...chunkIds] } },
              { documentId: null, chunkId: null },
            ],
          },
          orderBy: { createdAt: "asc" },
        }),
      ])
    : [[], []];

  return jsonSafe({
    kind: "awesome-rag-forge.portable-brain",
    version: PORTABLE_BRAIN_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    options: {
      includePendingReview: Boolean(options.includePendingReview),
      includeFeedbackAndReviews: Boolean(options.includeFeedbackAndReviews),
      includeEmbeddings: false,
    },
    warnings: [
      "Embeddings are not exported because RagChunk.embedding is stored as pgvector. Run npm run rag:embeddings:backfill after import.",
      "Do not add foreign-key relationships from these tables to host-app user/account tables. Use metadata scope refs instead.",
    ],
    data: {
      knowledgeScopes,
      ragCollections,
      ragDocuments,
      ragChunks,
      ragSources,
      ragFeedback,
      ragReviews,
      assistantConfigs,
      harnessRules,
      ragEvalCases,
    },
  });
}

async function existingIds(prisma: PrismaClient, tableName: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const sqlIds = ids.map(quoteSqlLiteral).join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `select id from "${tableName}" where id in (${sqlIds})`,
  );
  return new Set(rows.map((row) => row.id));
}

async function importRows(
  delegate: PrismaWriteDelegate,
  rows: BrainRow[],
  mode: PortableBrainImportMode,
) {
  if (rows.length === 0) return 0;
  if (mode === "skip") {
    await delegate.createMany({ data: rows, skipDuplicates: true });
    return rows.length;
  }

  for (const row of rows) {
    const id = idFrom(row);
    if (!id) continue;
    await delegate.upsert({ where: { id }, create: row, update: row });
  }
  return rows.length;
}

export async function dryRunPortableBrainImport(prisma: PrismaClient, snapshot: PortableBrainSnapshot) {
  const data = snapshot.data;
  const tables = [
    ["KnowledgeScope", data.knowledgeScopes],
    ["RagCollection", data.ragCollections],
    ["RagDocument", data.ragDocuments],
    ["RagChunk", data.ragChunks],
    ["RagSource", data.ragSources],
    ["RagFeedback", data.ragFeedback],
    ["RagReview", data.ragReviews],
    ["AssistantConfig", data.assistantConfigs],
    ["HarnessRule", data.harnessRules],
    ["RagEvalCase", data.ragEvalCases],
  ] as const;

  const result: Record<string, { incoming: number; existing: number; insertable: number }> = {};
  for (const [table, rows] of tables) {
    const ids = rows.map(idFrom).filter((id): id is string => Boolean(id));
    const existing = await existingIds(prisma, table, ids);
    result[table] = {
      incoming: rows.length,
      existing: existing.size,
      insertable: rows.length - existing.size,
    };
  }
  return result;
}

export async function importPortableBrainSnapshot(
  prisma: PrismaClient,
  snapshot: PortableBrainSnapshot,
  options: { dryRun?: boolean; mode?: PortableBrainImportMode } = {},
) {
  const db = asPortablePrisma(prisma);
  const mode = options.mode ?? "skip";
  const parsed = parsePortableBrainSnapshot(snapshot);

  if (options.dryRun) {
    return { dryRun: true, mode, tables: await dryRunPortableBrainImport(prisma, parsed) };
  }

  await importRows(db.knowledgeScope, parsed.data.knowledgeScopes, mode);

  const scopeIds = idSet(parsed.data.knowledgeScopes);
  const collectionRows = parsed.data.ragCollections.filter((row) => nullableReferenceOk(row, "scopeId", scopeIds));
  const collectionIds = idSet(collectionRows);
  const documentRows = parsed.data.ragDocuments.filter((row) => rowReferences(row, "collectionId", collectionIds));
  const documentIds = idSet(documentRows);
  const chunkRows = parsed.data.ragChunks.filter((row) => rowReferences(row, "documentId", documentIds));
  const chunkIds = idSet(chunkRows);
  const sourceRows = parsed.data.ragSources.filter(
    (row) => rowReferences(row, "documentId", documentIds) && nullableReferenceOk(row, "chunkId", chunkIds),
  );
  const feedbackRows = parsed.data.ragFeedback.filter(
    (row) => nullableReferenceOk(row, "documentId", documentIds) && nullableReferenceOk(row, "chunkId", chunkIds),
  );
  const reviewRows = parsed.data.ragReviews.filter(
    (row) => nullableReferenceOk(row, "documentId", documentIds) && nullableReferenceOk(row, "chunkId", chunkIds),
  );
  const evalRows = parsed.data.ragEvalCases.filter(
    (row) => row.collectionId == null || rowReferences(row, "collectionId", collectionIds),
  );

  const imported = {
    knowledgeScopes: parsed.data.knowledgeScopes.length,
    ragCollections: await importRows(db.ragCollection, collectionRows, mode),
    ragDocuments: await importRows(db.ragDocument, documentRows, mode),
    ragChunks: await importRows(db.ragChunk, chunkRows, mode),
    ragSources: await importRows(db.ragSource, sourceRows, mode),
    ragFeedback: await importRows(db.ragFeedback, feedbackRows, mode),
    ragReviews: await importRows(db.ragReview, reviewRows, mode),
    assistantConfigs: await importRows(db.assistantConfig, parsed.data.assistantConfigs, mode),
    harnessRules: await importRows(db.harnessRule, parsed.data.harnessRules, mode),
    ragEvalCases: await importRows(db.ragEvalCase, evalRows, mode),
  };

  return { dryRun: false, mode, imported };
}
