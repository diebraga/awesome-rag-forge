import { NextResponse } from "next/server";
import { getOllamaStatus } from "@/lib/ollama";

export async function GET() {
  const status = await getOllamaStatus();
  return NextResponse.json({ ok: true, ...status });
}
