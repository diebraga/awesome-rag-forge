import { describe, expect, it } from "vitest";
import { upsertEnvVar } from "./env-file";

describe("upsertEnvVar", () => {
  it("appends a new key to empty content", () => {
    expect(upsertEnvVar("", "DATABASE_URL", "postgres://x")).toBe('DATABASE_URL="postgres://x"\n');
  });

  it("appends a new key after existing content, adding a newline if missing", () => {
    expect(upsertEnvVar("FOO=bar", "DATABASE_URL", "postgres://x")).toBe(
      'FOO=bar\nDATABASE_URL="postgres://x"\n',
    );
  });

  it("replaces an existing key in place, preserving surrounding lines", () => {
    const before = 'FOO=bar\nDATABASE_URL="old"\nBAZ=qux\n';
    const after = upsertEnvVar(before, "DATABASE_URL", "new");
    expect(after).toBe('FOO=bar\nDATABASE_URL="new"\nBAZ=qux\n');
  });

  it("does not touch unrelated keys with a shared prefix", () => {
    const before = 'STORAGE_BUCKET="b"\nSTORAGE_BUCKET_OTHER="x"\n';
    const after = upsertEnvVar(before, "STORAGE_BUCKET", "new-bucket");
    expect(after).toContain('STORAGE_BUCKET_OTHER="x"');
    expect(after).toContain('STORAGE_BUCKET="new-bucket"');
  });
});
