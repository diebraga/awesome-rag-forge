"use server";

import { getDatabaseConnectionStatus } from "@/lib/database-health";
import {
  importPortableBrainSnapshot,
  parsePortableBrainSnapshot,
  summarizePortableBrainSnapshot,
} from "@/lib/portable-brain";
import { prisma } from "@/lib/prisma";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export type PortableBrainImportState = {
  ok: boolean;
  applied: boolean;
  message: string;
  summary?: unknown;
  dryRun?: unknown;
};

async function assertPortableBrainMode() {
  const database = await getDatabaseConnectionStatus();
  if (!database.ok) throw new Error("Database is not configured or reachable.");
  if (!isTestingSurfaceEnabled()) throw new Error("Testing surface is disabled.");
  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    throw new Error("Testing API key is required in public runtimes.");
  }
}

export async function importBrainAction(
  _previous: PortableBrainImportState,
  formData: FormData,
): Promise<PortableBrainImportState> {
  try {
    await assertPortableBrainMode();
    const raw = formData.get("snapshotJson");
    const apply = formData.get("apply") === "true";
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return { ok: false, applied: false, message: "Choose a brain snapshot first." };
    }

    const snapshot = parsePortableBrainSnapshot(JSON.parse(raw));
    const result = await importPortableBrainSnapshot(prisma, snapshot, {
      dryRun: !apply,
      mode: "skip",
    });

    return {
      ok: true,
      applied: apply,
      message: apply
        ? "Import applied. Rebuild embeddings next so semantic retrieval works in this database."
        : "Dry run complete. Review the summary, then apply import when ready.",
      summary: summarizePortableBrainSnapshot(snapshot),
      dryRun: result,
    };
  } catch (error) {
    return {
      ok: false,
      applied: false,
      message: error instanceof Error ? error.message : "Unable to import this brain snapshot.",
    };
  }
}
