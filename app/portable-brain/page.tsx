import { DatabaseConnectionFailed } from "@/app/database-connection-failed";
import { DatabaseSetupRequired } from "@/app/database-setup-required";
import { TestingApiAuthRequired } from "@/app/testing-api-auth-required";
import { TestingSurfaceDisabled } from "@/app/testing-surface-disabled";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { getPortableBrainStats } from "@/lib/portable-brain";
import { prisma } from "@/lib/prisma";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { PortableBrainPageClient } from "./portable-brain-page-client";

export const dynamic = "force-dynamic";

export default async function PortableBrainPage() {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return database.reason === "missing" ? <DatabaseSetupRequired /> : <DatabaseConnectionFailed />;
  }

  if (!isTestingSurfaceEnabled()) {
    return <TestingSurfaceDisabled />;
  }

  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    return <TestingApiAuthRequired />;
  }

  let stats;
  let loadError: unknown = null;
  try {
    stats = await getPortableBrainStats(prisma);
  } catch (error) {
    loadError = error;
  }

  if (!stats) {
    return (
      <main className="h-full overflow-y-auto bg-zinc-50 p-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError instanceof Error ? loadError.message : "Could not inspect the configured Postgres brain tables."}
        </div>
      </main>
    );
  }

  return <PortableBrainPageClient stats={stats} />;
}
