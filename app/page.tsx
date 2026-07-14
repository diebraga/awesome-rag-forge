import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { DatabaseConnectionFailed } from "./database-connection-failed";
import { DatabaseSetupRequired } from "./database-setup-required";
import { TestingSurfaceDisabled } from "./testing-surface-disabled";
import { TestingApiAuthRequired } from "./testing-api-auth-required";

export const dynamic = "force-dynamic";

export default async function Home() {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return database.reason === "missing" ? (
      <DatabaseSetupRequired />
    ) : (
      <DatabaseConnectionFailed maskedUrl={database.maskedUrl} />
    );
  }

  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }

  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    return <TestingApiAuthRequired />;
  }

  const { default: ChatPageClient } = await import("./chat-page-client");
  return <ChatPageClient />;
}
