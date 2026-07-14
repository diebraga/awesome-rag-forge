import { z } from "zod";
import { RagSourceType } from "../../generated/prisma/enums";
import { chunkSourceText, chunkPdfPages, type ExtractedPageInput } from "./chunking";
import { buildRetrievalAliases } from "../../lib/rag/retrieval-enrichment";
import { inferKnowledgeVisibility, KNOWLEDGE_AUDIENCES, KNOWLEDGE_SCOPE_KINDS, KNOWLEDGE_VISIBILITY_SCOPES, GLOBAL_KNOWLEDGE_SCOPE_ID } from "../../lib/rag/visibility";
import { buildPlacementReview, type PlacementCandidateInput } from "./placement-intelligence";
import { buildReviewTriage } from "./review-triage";
import { prisma } from "./prisma";

export const sourceTypeSchema = z.enum([
  "MARKDOWN",
  "PDF",
  "DOCX",
  "TXT",
  "URL",
  "API",
  "NOTE",
  "USER_UPLOAD",
  "OTHER",
]);

export const statusSchema = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

export const audienceSchema = z.enum(KNOWLEDGE_AUDIENCES);
export const visibilitySchema = z.enum(KNOWLEDGE_VISIBILITY_SCOPES);
export const knowledgeScopeKindSchema = z.enum(KNOWLEDGE_SCOPE_KINDS);

export const feedbackRatingSchema = z.enum([
  "GOOD",
  "BAD",
  "INCOMPLETE",
  "UNSAFE",
  "OUTDATED",
]);

export const proposalSchema = z.object({
  proposedCollection: z.object({
    id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    domain: z.string().optional(),
    tags: z.array(z.string()).default([]),
    audience: audienceSchema,
    visibility: z.array(visibilitySchema).default([]),
    scopeId: z.string().optional(),
  }),
  shouldCreateCollection: z.boolean(),
  proposedDocument: z.object({
    title: z.string(),
    sourceType: sourceTypeSchema,
    sourceUrl: z.string().optional(),
    category: z.string().optional(),
    domain: z.string().optional(),
    tags: z.array(z.string()).default([]),
    audience: audienceSchema,
    visibility: z.array(visibilitySchema).default([]),
    scopeId: z.string().optional(),
  }),
  chunkPlan: z.array(
    z.object({
      chunkIndex: z.number().int().min(0),
      chunkText: z.string(),
      sectionTitle: z.string().optional(),
      tokenCount: z.number().int().positive(),
      pageNumber: z.number().int().positive().optional(),
      retrievalAliases: z.array(z.string()).default([]),
    }),
  ),
  sourcePlan: z.object({
    label: z.string(),
    citationText: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  placementReview: z.object({
    recommendation: z.enum(["CREATE_NEW_DOCUMENT", "CREATE_RELATED_DOCUMENT", "UPDATE_EXISTING_DOCUMENT", "DUPLICATE_SKIP"]),
    confidence: z.number().min(0).max(1),
    summary: z.string(),
    reasons: z.array(z.string()),
    candidates: z.array(
      z.object({
        documentId: z.string(),
        title: z.string(),
        status: z.enum(["PENDING_REVIEW", "APPROVED"]).optional(),
        score: z.number(),
        overlapRatio: z.number(),
        matchingSignals: z.array(z.string()),
      }),
    ),
  }),
  reviewTriage: z.object({
    disposition: z.enum(["READY_FOR_BATCH_APPROVAL", "NEEDS_REVIEW", "CONFLICTS_WITH_APPROVED", "DUPLICATE_OR_UPDATE_CANDIDATE"]),
    confidence: z.number().min(0).max(1),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    summary: z.string(),
    reasons: z.array(z.string()),
    recommendedAction: z.string(),
    trustedUseBlocked: z.boolean(),
  }),
  reviewStatus: z.literal("PENDING_REVIEW"),
  warnings: z.array(z.string()),
  requiredUserQuestions: z.array(z.string()).default([]),
});

export type SourceProposal = z.infer<typeof proposalSchema>;

const AUDIENCE_CONFIRMATION_QUESTION =
  "Choose the audience for this knowledge: EXTERNAL (end-user/shareable), INTERNAL (operator/private), or RESTRICTED (sensitive/high-risk).";

function audienceRequiredQuestions(input: { audience?: unknown }) {
  return input.audience ? [] : [AUDIENCE_CONFIRMATION_QUESTION];
}

function titleFromSource(sourceText: string) {
  const firstLine = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Untitled source";
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

function defaultCollectionName(category?: string, domain?: string) {
  if (category && domain) return `${domain} ${category}`;
  if (category) return category;
  if (domain) return `${domain} knowledge`;
  return "General knowledge";
}

async function findPlacementCandidates(input: {
  collectionId?: string;
  category?: string;
  domain?: string;
  tags?: string[];
  scopeId?: string;
}): Promise<PlacementCandidateInput[]> {
  const candidateFilters = [
    input.collectionId ? { collectionId: input.collectionId } : undefined,
    input.domain ? { domain: input.domain } : undefined,
    input.category ? { category: input.category } : undefined,
    ...(input.tags ?? []).map((tag) => ({ tags: { has: tag } })),
  ].filter((clause): clause is { collectionId: string } | { domain: string } | { category: string } | { tags: { has: string } } => Boolean(clause));

  try {
    const documents = await prisma.ragDocument.findMany({
      where: {
        status: { in: ["PENDING_REVIEW", "APPROVED"] },
        scopeId: input.scopeId,
        ...(candidateFilters.length > 0 ? { OR: candidateFilters } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        domain: true,
        tags: true,
        metadata: true,
        chunks: {
          where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
          select: { chunkText: true },
          take: 8,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    });

    return documents.map((document) => ({
      id: document.id,
      title: document.title,
      status: document.status === "APPROVED" ? "APPROVED" : "PENDING_REVIEW",
      category: document.category,
      domain: document.domain,
      tags: document.tags,
      metadata: document.metadata,
      chunkTexts: document.chunks.map((chunk) => chunk.chunkText),
    }));
  } catch {
    return [];
  }
}


export async function buildSourceProposal(input: {
  title?: string;
  sourceText: string;
  sourceType: z.infer<typeof sourceTypeSchema>;
  sourceUrl?: string;
  category?: string;
  domain?: string;
  tags?: string[];
  audience?: z.infer<typeof audienceSchema>;
  visibility?: Array<z.infer<typeof visibilitySchema>>;
  collectionId?: string;
  scopeId?: string;
}) {
  const collection = input.collectionId
    ? await prisma.ragCollection.findUnique({
        where: { id: input.collectionId },
      })
    : null;

  const title = input.title?.trim() || titleFromSource(input.sourceText);
  const rawChunks = chunkSourceText(input.sourceText);
  const visibilityPlan = inferKnowledgeVisibility({
    text: input.sourceText,
    audience: input.audience,
    visibility: input.visibility,
  });
  const effectiveScopeId = input.scopeId ?? collection?.scopeId ?? GLOBAL_KNOWLEDGE_SCOPE_ID;
  const effectiveAudience = input.audience ?? collection?.audience ?? visibilityPlan.audience;
  const effectiveVisibility = input.visibility?.length
    ? input.visibility
    : collection?.visibility ?? visibilityPlan.visibility;
  const warnings: string[] = [...visibilityPlan.warnings];

  if (!input.category && !input.domain) {
    warnings.push("No category or domain was provided. Consider asking the user how this source should be classified.");
  }

  if (rawChunks.length === 1 && input.sourceText.length > 1800) {
    warnings.push("The source did not split cleanly into paragraphs. Review chunk quality before approval.");
  }

  const placementCandidates = await findPlacementCandidates({
    collectionId: input.collectionId,
    category: input.category,
    domain: input.domain,
    tags: input.tags,
    scopeId: effectiveScopeId,
  });
  const placementReview = buildPlacementReview({
    title,
    sourceText: input.sourceText,
    category: input.category,
    domain: input.domain,
    tags: input.tags,
    candidates: placementCandidates,
  });
  const reviewTriage = buildReviewTriage({
    sourceText: input.sourceText,
    warnings,
    placementReview,
  });

  const proposedCollection = collection
    ? {
        id: collection.id,
        name: collection.name,
        description: collection.description ?? undefined,
        category: collection.category ?? input.category,
        domain: collection.domain ?? input.domain,
        tags: collection.tags,
        audience: collection.audience,
        visibility: collection.visibility,
        scopeId: collection.scopeId ?? undefined,
      }
    : {
        name: defaultCollectionName(input.category, input.domain),
        description: "Created from an MCP source proposal.",
        category: input.category,
        domain: input.domain,
        tags: input.tags ?? [],
        audience: effectiveAudience,
        visibility: effectiveVisibility,
        scopeId: effectiveScopeId,
      };

  const chunks = rawChunks.map((chunk) => ({
    ...chunk,
    retrievalAliases: buildRetrievalAliases({
      title,
      chunkText: chunk.chunkText,
      sectionTitle: chunk.sectionTitle,
      category: input.category,
      domain: input.domain,
      tags: input.tags,
    }),
  }));

  return {
    proposedCollection,
    shouldCreateCollection: !collection,
    proposedDocument: {
      title,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      category: input.category,
      domain: input.domain,
      tags: input.tags ?? [],
      audience: effectiveAudience,
      visibility: effectiveVisibility,
      scopeId: effectiveScopeId,
    },
    chunkPlan: chunks,
    sourcePlan: {
      label: title,
      citationText: input.sourceUrl ? `${title} (${input.sourceUrl})` : title,
      sourceUrl: input.sourceUrl,
    },
    placementReview,
    reviewTriage,
    reviewStatus: "PENDING_REVIEW" as const,
    warnings,
    requiredUserQuestions: audienceRequiredQuestions(input),
  } satisfies SourceProposal;
}

export function toRagSourceType(sourceType: z.infer<typeof sourceTypeSchema>) {
  return sourceType as RagSourceType;
}

export async function buildFileProposal(input: {
  fileName: string;
  pages: ExtractedPageInput[];
  ocrPageCount: number;
  title?: string;
  category?: string;
  domain?: string;
  tags?: string[];
  audience?: z.infer<typeof audienceSchema>;
  visibility?: Array<z.infer<typeof visibilitySchema>>;
  collectionId?: string;
  scopeId?: string;
}) {
  const collection = input.collectionId
    ? await prisma.ragCollection.findUnique({
        where: { id: input.collectionId },
      })
    : null;

  const title = input.title?.trim() || input.fileName.replace(/\.pdf$/i, "").trim() || "Untitled document";
  const sourceText = input.pages.map((page) => page.text).join("\n\n");
  const rawChunks = chunkPdfPages(input.pages);
  const visibilityPlan = inferKnowledgeVisibility({
    text: sourceText,
    audience: input.audience,
    visibility: input.visibility,
  });
  const effectiveScopeId = input.scopeId ?? collection?.scopeId ?? GLOBAL_KNOWLEDGE_SCOPE_ID;
  const effectiveAudience = input.audience ?? collection?.audience ?? visibilityPlan.audience;
  const effectiveVisibility = input.visibility?.length
    ? input.visibility
    : collection?.visibility ?? visibilityPlan.visibility;
  const warnings: string[] = [...visibilityPlan.warnings];

  if (!input.category && !input.domain) {
    warnings.push("No category or domain was provided. Consider asking the user how this source should be classified.");
  }
  if (rawChunks.length === 0) {
    warnings.push("No extractable text was found in this PDF, even after OCR. The file will be stored, but nothing will be added to the knowledge base.");
  }
  if (input.ocrPageCount > 0) {
    warnings.push(
      `${input.ocrPageCount} of ${input.pages.length} page(s) had no text layer and were processed with OCR — verify accuracy before approving.`,
    );
  }

  const placementCandidates = await findPlacementCandidates({
    collectionId: input.collectionId,
    category: input.category,
    domain: input.domain,
    tags: input.tags,
    scopeId: effectiveScopeId,
  });
  const placementReview = buildPlacementReview({
    title,
    sourceText,
    category: input.category,
    domain: input.domain,
    tags: input.tags,
    candidates: placementCandidates,
  });
  const reviewTriage = buildReviewTriage({
    sourceText,
    warnings,
    placementReview,
  });

  const proposedCollection = collection
    ? {
        id: collection.id,
        name: collection.name,
        description: collection.description ?? undefined,
        category: collection.category ?? input.category,
        domain: collection.domain ?? input.domain,
        tags: collection.tags,
        audience: collection.audience,
        visibility: collection.visibility,
        scopeId: collection.scopeId ?? undefined,
      }
    : {
        name: defaultCollectionName(input.category, input.domain),
        description: "Created from an MCP file upload.",
        category: input.category,
        domain: input.domain,
        tags: input.tags ?? [],
        audience: effectiveAudience,
        visibility: effectiveVisibility,
        scopeId: effectiveScopeId,
      };

  const chunks = rawChunks.map((chunk) => ({
    ...chunk,
    retrievalAliases: buildRetrievalAliases({
      title,
      chunkText: chunk.chunkText,
      sectionTitle: chunk.sectionTitle,
      category: input.category,
      domain: input.domain,
      tags: input.tags,
    }),
  }));

  return {
    proposedCollection,
    shouldCreateCollection: !collection,
    proposedDocument: {
      title,
      sourceType: "PDF" as const,
      category: input.category,
      domain: input.domain,
      tags: input.tags ?? [],
      audience: effectiveAudience,
      visibility: effectiveVisibility,
      scopeId: effectiveScopeId,
    },
    chunkPlan: chunks,
    sourcePlan: {
      label: title,
      citationText: title,
    },
    placementReview,
    reviewTriage,
    reviewStatus: "PENDING_REVIEW" as const,
    warnings,
    requiredUserQuestions: audienceRequiredQuestions(input),
  } satisfies SourceProposal;
}
