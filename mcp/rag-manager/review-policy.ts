import type { ReviewTriage } from "./review-triage";

type KnowledgeStatus = "APPROVED" | "PENDING_REVIEW";

export const REVIEW_DECISIONS = ["AUTO", "SEND_TO_REVIEW", "APPROVE_ANYWAY"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

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

export function knowledgePersistencePolicy(triage: ReviewTriage, decision: ReviewDecision = "AUTO"): {
  documentStatus: KnowledgeStatus;
  chunkStatus: KnowledgeStatus;
  requiresReview: boolean;
  reviewReason: ReviewReason;
} {
  if (decision === "APPROVE_ANYWAY") {
    return {
      documentStatus: "APPROVED",
      chunkStatus: "APPROVED",
      requiresReview: false,
      reviewReason: {
        ...reviewReasonFromTriage(triage),
        title: triage.trustedUseBlocked ? "Approved despite review signal" : "Added directly to brain",
      },
    };
  }

  if (decision === "SEND_TO_REVIEW") {
    return {
      documentStatus: "PENDING_REVIEW",
      chunkStatus: "PENDING_REVIEW",
      requiresReview: true,
      reviewReason: {
        ...reviewReasonFromTriage(triage),
        title: triage.trustedUseBlocked ? reviewReasonFromTriage(triage).title : "Sent to review by user",
      },
    };
  }

  const requiresReview = triage.trustedUseBlocked;
  const status: KnowledgeStatus = requiresReview ? "PENDING_REVIEW" : "APPROVED";

  return {
    documentStatus: status,
    chunkStatus: status,
    requiresReview,
    reviewReason: reviewReasonFromTriage(triage),
  };
}

export function reviewDecisionQuestions(triage: ReviewTriage) {
  if (!triage.trustedUseBlocked) return [];

  const reason = reviewReasonFromTriage(triage);
  return [
    `This knowledge needs a decision because: ${reason.title}. ${reason.summary} Choose one: APPROVE_ANYWAY to add it directly to the brain, SEND_TO_REVIEW to keep it pending with this reason, revise the proposal/classification, merge/update an existing document, or cancel.`,
  ];
}
