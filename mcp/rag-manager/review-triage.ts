import type { PlacementReview } from "./placement-intelligence";

export type ReviewTriageDisposition =
  | "READY_FOR_BATCH_APPROVAL"
  | "NEEDS_REVIEW"
  | "CONFLICTS_WITH_APPROVED"
  | "DUPLICATE_OR_UPDATE_CANDIDATE";

export type ReviewTriagePriority = "LOW" | "MEDIUM" | "HIGH";

export type ReviewTriage = {
  disposition: ReviewTriageDisposition;
  confidence: number;
  priority: ReviewTriagePriority;
  summary: string;
  reasons: string[];
  recommendedAction: string;
  trustedUseBlocked: boolean;
};

function clampConfidence(value: number) {
  return Math.max(0.1, Math.min(0.99, Number(value.toFixed(2))));
}

function looksContradictory(text: string) {
  return /\b(no longer|not true|incorrect|wrong|replaces?|instead of|deprecated|supersedes?|contradicts?|changed from|changed to)\b/i.test(
    text,
  );
}

export function buildReviewTriage(input: {
  sourceText: string;
  warnings: string[];
  placementReview: PlacementReview;
}): ReviewTriage {
  const reasons: string[] = [];
  const bestCandidate = input.placementReview.candidates[0];
  const hasApprovedNearbyKnowledge = input.placementReview.candidates.some((candidate) => candidate.status === "APPROVED");
  const hasWarnings = input.warnings.length > 0;

  if (hasApprovedNearbyKnowledge && looksContradictory(input.sourceText)) {
    reasons.push("The source uses wording that often signals a correction or replacement of existing approved knowledge.");
    if (bestCandidate) reasons.push(`Closest approved-or-pending match: ${bestCandidate.title}.`);

    return {
      disposition: "CONFLICTS_WITH_APPROVED",
      confidence: 0.92,
      priority: "HIGH",
      summary: "This source may contradict or replace existing approved knowledge.",
      reasons,
      recommendedAction: "Review the nearby approved document before approving, then merge, update, or keep as a versioned related document.",
      trustedUseBlocked: true,
    };
  }

  if (input.placementReview.recommendation === "DUPLICATE_SKIP" || input.placementReview.recommendation === "UPDATE_EXISTING_DOCUMENT") {
    reasons.push(...input.placementReview.reasons);

    return {
      disposition: "DUPLICATE_OR_UPDATE_CANDIDATE",
      confidence: clampConfidence(Math.max(input.placementReview.confidence, 0.82)),
      priority: input.placementReview.recommendation === "DUPLICATE_SKIP" ? "HIGH" : "MEDIUM",
      summary: input.placementReview.summary,
      reasons,
      recommendedAction:
        input.placementReview.recommendation === "DUPLICATE_SKIP"
          ? "Do not approve a second copy until the reviewer confirms this is not a duplicate."
          : "Review whether this should update/version the existing document instead of becoming disconnected knowledge.",
      trustedUseBlocked: true,
    };
  }

  if (hasWarnings) {
    reasons.push(...input.warnings);

    return {
      disposition: "NEEDS_REVIEW",
      confidence: 0.74,
      priority: "MEDIUM",
      summary: "This source was saved, but extraction or classification warnings make human review important.",
      reasons,
      recommendedAction: "Review the extracted text, classification, and chunk boundaries before approval.",
      trustedUseBlocked: true,
    };
  }

  if (input.placementReview.recommendation === "CREATE_RELATED_DOCUMENT") {
    reasons.push(...input.placementReview.reasons);

    return {
      disposition: "NEEDS_REVIEW",
      confidence: clampConfidence(input.placementReview.confidence),
      priority: "MEDIUM",
      summary: input.placementReview.summary,
      reasons,
      recommendedAction: "Review the relationship to existing knowledge, then approve as a related document if the separation is useful.",
      trustedUseBlocked: true,
    };
  }

  return {
    disposition: "READY_FOR_BATCH_APPROVAL",
    confidence: 0.88,
    priority: "LOW",
    summary: "This looks like a clean new source with no nearby duplicate, update, contradiction, or extraction warning.",
    reasons: ["No review warnings were raised.", ...input.placementReview.reasons],
    recommendedAction: "Use immediately. It can still be audited later if feedback or future edits reveal a problem.",
    trustedUseBlocked: false,
  };
}
