CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "RagSourceType" AS ENUM (
  'MARKDOWN',
  'PDF',
  'DOCX',
  'URL',
  'STATUTE',
  'REGULATION',
  'CASE',
  'MEMO',
  'CHECKLIST',
  'USER_UPLOAD',
  'OTHER'
);

CREATE TYPE "RagStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE "RagFeedbackRating" AS ENUM (
  'GOOD',
  'BAD',
  'INCOMPLETE',
  'UNSAFE',
  'OUTDATED'
);

CREATE TYPE "RagReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "RagCollection" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "matterType" TEXT,
  "jurisdiction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagDocument" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceType" "RagSourceType" NOT NULL,
  "sourceUrl" TEXT,
  "storageKey" TEXT,
  "jurisdiction" TEXT,
  "matterType" TEXT,
  "status" "RagStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkText" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "pageNumber" INTEGER,
  "sectionTitle" TEXT,
  "tokenCount" INTEGER,
  "embedding" vector(768),
  "status" "RagStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagSource" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkId" TEXT,
  "label" TEXT NOT NULL,
  "citationText" TEXT,
  "pageNumber" INTEGER,
  "sectionTitle" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagFeedback" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "chunkId" TEXT,
  "question" TEXT,
  "answer" TEXT,
  "rating" "RagFeedbackRating" NOT NULL,
  "comment" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagReview" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "chunkId" TEXT,
  "status" "RagReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewer" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "RagReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagEvalCase" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT,
  "question" TEXT NOT NULL,
  "expectedAnswer" TEXT,
  "expectedSources" JSONB,
  "matterType" TEXT,
  "jurisdiction" TEXT,
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagEvalCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RagChunk_documentId_chunkIndex_key" ON "RagChunk"("documentId", "chunkIndex");
CREATE INDEX "RagCollection_matterType_idx" ON "RagCollection"("matterType");
CREATE INDEX "RagCollection_jurisdiction_idx" ON "RagCollection"("jurisdiction");
CREATE INDEX "RagDocument_collectionId_idx" ON "RagDocument"("collectionId");
CREATE INDEX "RagDocument_status_idx" ON "RagDocument"("status");
CREATE INDEX "RagDocument_sourceType_idx" ON "RagDocument"("sourceType");
CREATE INDEX "RagDocument_matterType_idx" ON "RagDocument"("matterType");
CREATE INDEX "RagDocument_jurisdiction_idx" ON "RagDocument"("jurisdiction");
CREATE INDEX "RagChunk_documentId_idx" ON "RagChunk"("documentId");
CREATE INDEX "RagChunk_status_idx" ON "RagChunk"("status");
CREATE INDEX "RagChunk_sectionTitle_idx" ON "RagChunk"("sectionTitle");
CREATE INDEX "RagSource_documentId_idx" ON "RagSource"("documentId");
CREATE INDEX "RagSource_chunkId_idx" ON "RagSource"("chunkId");
CREATE INDEX "RagFeedback_documentId_idx" ON "RagFeedback"("documentId");
CREATE INDEX "RagFeedback_chunkId_idx" ON "RagFeedback"("chunkId");
CREATE INDEX "RagFeedback_rating_idx" ON "RagFeedback"("rating");
CREATE INDEX "RagReview_documentId_idx" ON "RagReview"("documentId");
CREATE INDEX "RagReview_chunkId_idx" ON "RagReview"("chunkId");
CREATE INDEX "RagReview_status_idx" ON "RagReview"("status");
CREATE INDEX "RagEvalCase_collectionId_idx" ON "RagEvalCase"("collectionId");
CREATE INDEX "RagEvalCase_matterType_idx" ON "RagEvalCase"("matterType");
CREATE INDEX "RagEvalCase_jurisdiction_idx" ON "RagEvalCase"("jurisdiction");

CREATE INDEX "RagChunk_embedding_hnsw_idx"
  ON "RagChunk"
  USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "RagDocument"
  ADD CONSTRAINT "RagDocument_collectionId_fkey"
  FOREIGN KEY ("collectionId")
  REFERENCES "RagCollection"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagChunk"
  ADD CONSTRAINT "RagChunk_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "RagDocument"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagSource"
  ADD CONSTRAINT "RagSource_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "RagDocument"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagSource"
  ADD CONSTRAINT "RagSource_chunkId_fkey"
  FOREIGN KEY ("chunkId")
  REFERENCES "RagChunk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagFeedback"
  ADD CONSTRAINT "RagFeedback_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "RagDocument"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "RagFeedback"
  ADD CONSTRAINT "RagFeedback_chunkId_fkey"
  FOREIGN KEY ("chunkId")
  REFERENCES "RagChunk"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "RagReview"
  ADD CONSTRAINT "RagReview_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "RagDocument"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagReview"
  ADD CONSTRAINT "RagReview_chunkId_fkey"
  FOREIGN KEY ("chunkId")
  REFERENCES "RagChunk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "RagEvalCase"
  ADD CONSTRAINT "RagEvalCase_collectionId_fkey"
  FOREIGN KEY ("collectionId")
  REFERENCES "RagCollection"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
