import { describe, expect, test } from "vitest";
import { maskDatabaseUrl } from "./mask-database-url";

describe("maskDatabaseUrl", () => {
  test("redacts username and password, keeps host/port/db/query", () => {
    expect(maskDatabaseUrl("postgresql://user:secretpass@db.example.com:5432/mydb?schema=public")).toBe(
      "postgresql://***@db.example.com:5432/mydb?schema=public",
    );
  });

  test("never contains the original username or password", () => {
    const masked = maskDatabaseUrl("postgresql://alice:hunter2@localhost:5432/app");
    expect(masked).not.toContain("alice");
    expect(masked).not.toContain("hunter2");
  });

  test("returns null for an unparseable value instead of guessing", () => {
    expect(maskDatabaseUrl("not a url")).toBeNull();
  });
});
