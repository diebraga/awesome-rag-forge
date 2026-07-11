import { NextResponse } from "next/server";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { getTestingApiAuthFailure } from "@/lib/testing-api-auth";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";

export async function getTestingApiReadinessFailure(request: Request) {
  const database = await getDatabaseConnectionStatus();

  if (!database.ok) {
    return NextResponse.json(
      { ok: false, error: database.error, reason: database.reason },
      { status: 503 },
    );
  }

  if (!isTestingSurfaceEnabled()) {
    return NextResponse.json(
      { ok: false, error: TESTING_SURFACE_DISABLED_ERROR },
      { status: 404 },
    );
  }

  const authFailure = getTestingApiAuthFailure(request);
  if (authFailure) {
    return authFailure;
  }

  return null;
}
