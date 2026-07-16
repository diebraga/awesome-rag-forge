import { describe, expect, test, vi } from "vitest";
import { getOrSetCached } from "./ttl-cache";

describe("getOrSetCached", () => {
  test("only computes once within the TTL window", async () => {
    const compute = vi.fn().mockResolvedValue("value");
    const key = `test-key-${Math.random()}`;

    expect(await getOrSetCached(key, 1000, compute)).toBe("value");
    expect(await getOrSetCached(key, 1000, compute)).toBe("value");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  test("recomputes once the TTL has elapsed", async () => {
    const compute = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const key = `test-key-${Math.random()}`;

    expect(await getOrSetCached(key, 10, compute)).toBe("first");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await getOrSetCached(key, 10, compute)).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  test("different keys never share a cached value", async () => {
    const computeA = vi.fn().mockResolvedValue("a");
    const computeB = vi.fn().mockResolvedValue("b");

    expect(await getOrSetCached("key-a", 1000, computeA)).toBe("a");
    expect(await getOrSetCached("key-b", 1000, computeB)).toBe("b");
  });
});
