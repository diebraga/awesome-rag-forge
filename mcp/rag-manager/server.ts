#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  feedbackRatingSchema,
  proposalSchema,
  sourceTypeSchema,
  statusSchema,
  buildSourceProposal,
  toRagSourceType,
} from "./proposal";
import { disconnectPrisma, prisma } from "./prisma";
import { isStorageConfigured, STORAGE_NOT_CONFIGURED_MESSAGE } from "../../lib/storage";

const server = new McpServer({
  name: "rag-manager-mcp",
  title: "RAG Manager MCP",
  version: "0.1.0",
});

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

server.registerTool(
  "list_collections",
  {
    title: "List RAG collections",
    description: "List existing knowledge collections so the assistant can decide where new knowledge belongs.",
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ query, limit }) => {
    const collections = await prisma.ragCollection.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { category: { contains: query, mode: "insensitive" } },
              { domain: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        _count: {
          select: { documents: true, evalCases: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return jsonResult(collections);
  },
);

server.registerTool(
  "create_collection",
  {
    title: "Create RAG collection",
    description: "Create a knowledge collection such as 'Onboarding Docs' or 'API Reference'.",
    inputSchema: {
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      domain: z.string().optional(),
      tags: z.array(z.string()).default([]),
    },
  },
  async (input) => {
    const collection = await prisma.ragCollection.create({ data: input });
    return jsonResult(collection);
  },
);

server.registerTool(
  "list_documents",
  {
    title: "List RAG documents",
    description: "List knowledge sources, optionally filtered by collection, category, domain, or status.",
    inputSchema: {
      collectionId: z.string().optional(),
      category: z.string().optional(),
      domain: z.string().optional(),
      status: statusSchema.optional(),
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ collectionId, category, domain, status, limit }) => {
    const documents = await prisma.ragDocument.findMany({
      where: {
        collectionId,
        category,
        domain,
        status,
      },
      include: {
        collection: {
          select: { id: true, name: true },
        },
        _count: {
          select: { chunks: true, sources: true, reviews: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return jsonResult(documents);
  },
);

server.registerTool(
  "search_knowledge_base",
  {
    title: "Search RAG knowledge",
    description: "Search approved or filtered chunks using simple text search. This is pre-vector-search MVP retrieval.",
    inputSchema: {
      query: z.string().min(1),
      collectionId: z.string().optional(),
      category: z.string().optional(),
      domain: z.string().optional(),
      status: statusSchema.optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
  },
  async ({ query, collectionId, category, domain, status, limit }) => {
    const chunks = await prisma.ragChunk.findMany({
      where: {
        status,
        chunkText: { contains: query, mode: "insensitive" },
        document: {
          collectionId,
          category,
          domain,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            category: true,
            domain: true,
            status: true,
            collection: { select: { id: true, name: true } },
          },
        },
        sources: {
          select: {
            label: true,
            citationText: true,
            sourceUrl: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return jsonResult(chunks);
  },
);

server.registerTool(
  "propose_source_insert",
  {
    title: "Propose source insert",
    description: "Analyze source text and propose where/how to store it. This tool does not write to the database.",
    inputSchema: {
      title: z.string().optional(),
      sourceText: z.string().min(1),
      sourceType: sourceTypeSchema,
      sourceUrl: z.string().optional(),
      category: z.string().optional(),
      domain: z.string().optional(),
      tags: z.array(z.string()).optional(),
      collectionId: z.string().optional(),
    },
  },
  async (input) => {
    const proposal = await buildSourceProposal(input);
    return jsonResult({
      proposal,
      requiredUserQuestion: "Do you want me to save this to the knowledge base?",
      writesToDatabase: false,
    });
  },
);

server.registerTool(
  "approve_source_insert",
  {
    title: "Approve source insert",
    description: "Persist a previously approved source proposal into the RAG database. Refuses to write unless userApproval is true.",
    inputSchema: {
      proposal: proposalSchema,
      userApproval: z.boolean(),
    },
  },
  async ({ proposal, userApproval }) => {
    if (!userApproval) {
      return textResult("Refused to write. userApproval must be true before saving knowledge.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const collection = proposal.shouldCreateCollection
        ? await tx.ragCollection.create({
            data: {
              name: proposal.proposedCollection.name,
              description: proposal.proposedCollection.description,
              category: proposal.proposedCollection.category,
              domain: proposal.proposedCollection.domain,
              tags: proposal.proposedCollection.tags,
            },
          })
        : await tx.ragCollection.findUniqueOrThrow({
            where: { id: proposal.proposedCollection.id },
          });

      const document = await tx.ragDocument.create({
        data: {
          collectionId: collection.id,
          title: proposal.proposedDocument.title,
          sourceType: toRagSourceType(proposal.proposedDocument.sourceType),
          sourceUrl: proposal.proposedDocument.sourceUrl,
          category: proposal.proposedDocument.category,
          domain: proposal.proposedDocument.domain,
          tags: proposal.proposedDocument.tags,
          status: "PENDING_REVIEW",
          metadata: {
            insertedBy: "rag-manager-mcp",
            warnings: proposal.warnings,
          },
        },
      });

      const chunks = [];
      for (const chunk of proposal.chunkPlan) {
        const createdChunk = await tx.ragChunk.create({
          data: {
            documentId: document.id,
            chunkText: chunk.chunkText,
            chunkIndex: chunk.chunkIndex,
            sectionTitle: chunk.sectionTitle,
            tokenCount: chunk.tokenCount,
            status: "PENDING_REVIEW",
            metadata: {
              insertedBy: "rag-manager-mcp",
            },
          },
        });

        await tx.ragSource.create({
          data: {
            documentId: document.id,
            chunkId: createdChunk.id,
            label: proposal.sourcePlan.label,
            citationText: proposal.sourcePlan.citationText,
            sectionTitle: chunk.sectionTitle,
            sourceUrl: proposal.sourcePlan.sourceUrl,
          },
        });

        chunks.push(createdChunk);
      }

      return { collection, document, chunks };
    });

    return jsonResult({
      ...result,
      message: "Source saved as PENDING_REVIEW. A human reviewer must approve chunks before the live chat should rely on them.",
    });
  },
);

server.registerTool(
  "attach_document_file",
  {
    title: "Attach original document file",
    description:
      "Record that an original file should be stored alongside a document. Requires bucket/storage environment variables to be configured; refuses otherwise.",
    inputSchema: {
      documentId: z.string(),
      fileName: z.string().min(1),
      storageKey: z.string().min(1),
    },
  },
  async ({ documentId, fileName, storageKey }) => {
    if (!isStorageConfigured()) {
      return textResult(STORAGE_NOT_CONFIGURED_MESSAGE);
    }

    const document = await prisma.ragDocument.update({
      where: { id: documentId },
      data: {
        storageKey,
        metadata: {
          originalFileName: fileName,
        },
      },
    });

    return jsonResult(document);
  },
);

server.registerTool(
  "list_pending_reviews",
  {
    title: "List pending reviews",
    description: "List documents and chunks waiting for human review.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  async ({ limit }) => {
    const [documents, chunks] = await Promise.all([
      prisma.ragDocument.findMany({
        where: { status: "PENDING_REVIEW" },
        include: { collection: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        take: limit,
      }),
      prisma.ragChunk.findMany({
        where: { status: "PENDING_REVIEW" },
        include: {
          document: { select: { id: true, title: true } },
          sources: { select: { label: true, citationText: true, sourceUrl: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
      }),
    ]);

    return jsonResult({ documents, chunks });
  },
);

server.registerTool(
  "approve_chunk",
  {
    title: "Approve chunk",
    description: "Approve one chunk for use by the live chat and create a review record.",
    inputSchema: {
      chunkId: z.string(),
      reviewer: z.string().optional(),
      notes: z.string().optional(),
    },
  },
  async ({ chunkId, reviewer, notes }) => {
    const result = await prisma.$transaction(async (tx) => {
      const chunk = await tx.ragChunk.update({
        where: { id: chunkId },
        data: { status: "APPROVED" },
      });
      const review = await tx.ragReview.create({
        data: {
          chunkId,
          documentId: chunk.documentId,
          status: "APPROVED",
          reviewer,
          notes,
          reviewedAt: new Date(),
        },
      });
      return { chunk, review };
    });

    return jsonResult(result);
  },
);

server.registerTool(
  "reject_chunk",
  {
    title: "Reject chunk",
    description: "Reject one chunk and create a review record with notes.",
    inputSchema: {
      chunkId: z.string(),
      reviewer: z.string().optional(),
      notes: z.string().min(1),
    },
  },
  async ({ chunkId, reviewer, notes }) => {
    const result = await prisma.$transaction(async (tx) => {
      const chunk = await tx.ragChunk.update({
        where: { id: chunkId },
        data: { status: "REJECTED" },
      });
      const review = await tx.ragReview.create({
        data: {
          chunkId,
          documentId: chunk.documentId,
          status: "REJECTED",
          reviewer,
          notes,
          reviewedAt: new Date(),
        },
      });
      return { chunk, review };
    });

    return jsonResult(result);
  },
);

server.registerTool(
  "add_feedback",
  {
    title: "Add RAG feedback",
    description: "Store feedback about good, bad, incomplete, unsafe, or outdated answers/chunks.",
    inputSchema: {
      question: z.string().optional(),
      answer: z.string().optional(),
      documentId: z.string().optional(),
      chunkId: z.string().optional(),
      rating: feedbackRatingSchema,
      comment: z.string().optional(),
    },
  },
  async (input) => {
    const feedback = await prisma.ragFeedback.create({ data: input });
    return jsonResult(feedback);
  },
);

server.registerTool(
  "create_eval_case",
  {
    title: "Create RAG eval case",
    description: "Create a test question for future RAG quality evaluation.",
    inputSchema: {
      question: z.string().min(1),
      expectedAnswer: z.string().optional(),
      expectedSources: z
        .array(
          z.object({
            label: z.string(),
            citationText: z.string().optional(),
            sourceUrl: z.string().optional(),
          }),
        )
        .optional(),
      collectionId: z.string().optional(),
      category: z.string().optional(),
      domain: z.string().optional(),
      tags: z.array(z.string()).default([]),
    },
  },
  async (input) => {
    const evalCase = await prisma.ragEvalCase.create({
      data: {
        question: input.question,
        expectedAnswer: input.expectedAnswer,
        expectedSources: input.expectedSources
          ? { sources: input.expectedSources }
          : undefined,
        collectionId: input.collectionId,
        category: input.category,
        domain: input.domain,
        tags: input.tags,
      },
    });
    return jsonResult(evalCase);
  },
);

process.on("SIGINT", async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectPrisma();
  process.exit(0);
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch(async (error) => {
  console.error(error);
  await disconnectPrisma();
  process.exit(1);
});
