import { isPublicDeploymentRuntime } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";

export const LOCAL_REVIEW_PRODUCTION_ERROR =
  "Direct database review is local development only. Do not expose the review dashboard in production runtimes.";

export function getLocalReviewModeFailure() {
  if (!isTestingSurfaceEnabled()) return TESTING_SURFACE_DISABLED_ERROR;
  if (isPublicDeploymentRuntime()) return LOCAL_REVIEW_PRODUCTION_ERROR;
  return null;
}

export function assertLocalReviewMode() {
  const failure = getLocalReviewModeFailure();
  if (failure) throw new Error(failure);
}
