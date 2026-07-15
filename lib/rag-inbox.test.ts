import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RAG_INBOX_DIRNAME, writeToInbox } from "./rag-inbox";

describe("writeToInbox", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("writes file contents under a .rag-inbox directory", () => {
    dir = mkdtempSync(join(tmpdir(), "rag-inbox-test-"));
    writeToInbox([{ name: "notes.txt", content: Buffer.from("hello") }], dir);
    const written = readFileSync(join(dir, RAG_INBOX_DIRNAME, "notes.txt"), "utf-8");
    expect(written).toBe("hello");
  });

  test("strips directory components from filenames", () => {
    dir = mkdtempSync(join(tmpdir(), "rag-inbox-test-"));
    writeToInbox([{ name: "../../etc/passwd", content: Buffer.from("x") }], dir);
    expect(existsSync(join(dir, RAG_INBOX_DIRNAME, ".._.._etc_passwd"))).toBe(true);
    expect(existsSync(join(dir, "..", "..", "etc", "passwd"))).toBe(false);
  });
});
