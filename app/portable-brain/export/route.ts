import { NextRequest, NextResponse } from "next/server";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { createPortableBrainSnapshot } from "@/lib/portable-brain";
import { prisma } from "@/lib/prisma";
import { isPublicDeploymentRuntime, isTestingApiKeyConfigured } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const database = await getDatabaseConnectionStatus();
  if (!database.ok) {
    return NextResponse.json({ error: "Database is not configured or reachable." }, { status: 503 });
  }
  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json({ error: "Testing surface is disabled." }, { status: 404 });
  }
  if (isPublicDeploymentRuntime() && !isTestingApiKeyConfigured()) {
    return NextResponse.json({ error: "Testing API key is required in public runtimes." }, { status: 401 });
  }

  const snapshot = await createPortableBrainSnapshot(prisma, {
    includePendingReview: request.nextUrl.searchParams.get("includePending") === "true",
    includeFeedbackAndReviews: request.nextUrl.searchParams.get("includeFeedback") === "true",
  });
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="awesome-rag-forge-brain-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
