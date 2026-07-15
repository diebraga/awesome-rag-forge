import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/cli-providers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cli-providers")>("@/lib/cli-providers");
  return { ...actual, isCliAvailable: vi.fn() };
});

import { isCliAvailable } from "@/lib/cli-providers";
import { POST } from "./route";

function requestWith(body: unknown) {
  return new Request("http://localhost:3000/api/knowledge/resolve-command", {
    method: "POST",
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/knowledge/resolve-command", () => {
  test("returns the CLI binary + prompt when installed", async () => {
    vi.mocked(isCliAvailable).mockResolvedValue(true);
    const response = await POST(requestWith({ providerId: "claude", prompt: "hello" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, program: "claude", args: ["hello"], cwd: process.cwd() });
  });

  test("returns the install command when the CLI is missing", async () => {
    vi.mocked(isCliAvailable).mockResolvedValue(false);
    const response = await POST(requestWith({ providerId: "codex", prompt: "hello" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, program: "npm", args: ["install", "-g", "@openai/codex"], cwd: process.cwd() });
  });

  test("rejects an unknown provider", async () => {
    const response = await POST(requestWith({ providerId: "nope" }));
    expect(response.status).toBe(400);
  });
});
