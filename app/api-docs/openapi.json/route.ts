import { NextResponse } from "next/server";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { isTestingSurfaceEnabled, TESTING_SURFACE_DISABLED_ERROR } from "@/lib/testing-surface";
import openApiSpec from "../openapi.generated.json";

export async function GET() {
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

  return NextResponse.json(openApiSpec);
}
