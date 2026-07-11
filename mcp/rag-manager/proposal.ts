import { z } from "zod";
import { RagSourceType } from "../../generated/prisma/enums";
import { chunkSourceText, chunkPdfPages, type ExtractedPageInput } from "./chunking";
import { buildRetrievalAliases } from "./retrieval-enrichment";
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
  }),
  shouldCreateCollection: z.boolean(),
  proposedDocument: z.object({
    title: z.string(),
    sourceType: sourceTypeSchema,
    sourceUrl: z.string().optional(),
    category: z.string().optional(),
    domain: z.string().optional(),
    tags: z.array(z.string()).default([]),
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
  reviewStatus: z.literal("PENDING_REVIEW"),
  warnings: z.array(z.string()),
});

export type SourceProposal = z.infer<typeof proposalSchema>;

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

export async function buildSourceProposal(input: {
  title?: string;
  sourceText: string;
  sourceType: z.infer<typeof sourceTypeSchema>;
  sourceUrl?: string;
  category?: string;
  domain?: string;
  tags?: string[];
  collectionId?: string;
}) {
  const collection = input.collectionId
    ? await prisma.ragCollection.findUnique({
        where: { id: input.collectionId },
      })
    : null;

  const title = input.title?.trim() || titleFromSource(input.sourceText);
  const rawChunks = chunkSourceText(input.sourceText);
  const warnings: string[] = [];

  if (!input.category && !input.domain) {
    warnings.push("No category or domain was provided. Consider asking the user how this source should be classified.");
  }

  if (rawChunks.length === 1 && input.sourceText.length > 1800) {
    warnings.push("The source did not split cleanly into paragraphs. Review chunk quality before approval.");
  }

  const proposedCollection = collection
    ? {
        id: collection.id,
        name: collection.name,
        description: collection.description ?? undefined,
        category: collection.category ?? input.category,
        domain: collection.domain ?? input.domain,
        tags: collection.tags,
      }
    : {
        name: defaultCollectionName(input.category, input.domain),
        description: "Created from an MCP source proposal.",
        category: input.category,
        domain: input.domain,
        tags: input.tags ?? [],
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
    },
    chunkPlan: chunks,
    sourcePlan: {
      label: title,
      citationText: input.sourceUrl ? `${title} (${input.sourceUrl})` : title,
      sourceUrl: input.sourceUrl,
    },
    reviewStatus: "PENDING_REVIEW" as const,
    warnings,
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
  collectionId?: string;
}) {
  const collection = input.collectionId
    ? await prisma.ragCollection.findUnique({
        where: { id: input.collectionId },
      })
    : null;

  const title = input.title?.trim() || input.fileName.replace(/\.pdf$/i, "").trim() || "Untitled document";
  const rawChunks = chunkPdfPages(input.pages);
  const warnings: string[] = [];

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

  const proposedCollection = collection
    ? {
        id: collection.id,
        name: collection.name,
        description: collection.description ?? undefined,
        category: collection.category ?? input.category,
        domain: collection.domain ?? input.domain,
        tags: collection.tags,
      }
    : {
        name: defaultCollectionName(input.category, input.domain),
        description: "Created from an MCP file upload.",
        category: input.category,
        domain: input.domain,
        tags: input.tags ?? [],
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
    },
    chunkPlan: chunks,
    sourcePlan: {
      label: title,
      citationText: title,
    },
    reviewStatus: "PENDING_REVIEW" as const,
    warnings,
  } satisfies SourceProposal;
}
