import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { TestingSurfaceDisabled } from "./testing-surface-disabled";
import { TestingApiAuthRequired } from "./testing-api-auth-required";

export default async function Home() {
  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }

  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    return <TestingApiAuthRequired />;
  }

  const { default: ChatPageClient } = await import("./chat-page-client");
  return <ChatPageClient />;
}
