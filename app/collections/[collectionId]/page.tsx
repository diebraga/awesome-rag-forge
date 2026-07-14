import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { TestingSurfaceDisabled } from "../../testing-surface-disabled";
import { TestingApiAuthRequired } from "../../testing-api-auth-required";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }

  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    return <TestingApiAuthRequired />;
  }

  const { default: CollectionDetailPageClient } = await import("./collection-detail-page-client");
  return <CollectionDetailPageClient params={params} />;
}
