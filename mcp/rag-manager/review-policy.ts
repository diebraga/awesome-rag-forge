import type { ReviewTriage } from "./review-triage";

type KnowledgeStatus = "APPROVED" | "PENDING_REVIEW";

export type ReviewReason = {
  title: string;
  summary: string;
  reasons: string[];
  recommendedAction: string;
};

const REVIEW_TITLES: Record<ReviewTriage["disposition"], string> = {
  READY_FOR_BATCH_APPROVAL: "Added directly to brain",
  NEEDS_REVIEW: "Needs human review",
  CONFLICTS_WITH_APPROVED: "Possible conflict",
  DUPLICATE_OR_UPDATE_CANDIDATE: "Possible duplicate or update",
};

export function reviewReasonFromTriage(triage: ReviewTriage): ReviewReason {
  return {
    title: REVIEW_TITLES[triage.disposition],
    summary: triage.summary,
    reasons: triage.reasons,
    recommendedAction: triage.recommendedAction,
  };
}

export function knowledgePersistencePolicy(triage: ReviewTriage): {
  documentStatus: KnowledgeStatus;
  chunkStatus: KnowledgeStatus;
  requiresReview: boolean;
  reviewReason: ReviewReason;
} {
  const requiresReview = triage.trustedUseBlocked;
  const status: KnowledgeStatus = requiresReview ? "PENDING_REVIEW" : "APPROVED";

  return {
    documentStatus: status,
    chunkStatus: status,
    requiresReview,
    reviewReason: reviewReasonFromTriage(triage),
  };
}
