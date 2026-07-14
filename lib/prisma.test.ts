import { describe, expect, test, vi, beforeEach } from "vitest";

const mockGetDatabaseUrl = vi.fn();
vi.mock("@/lib/database-config", () => ({ getDatabaseUrl: mockGetDatabaseUrl }));

const mockPrismaClientCtor = vi.fn().mockImplementation(function MockPrismaClient(this: { $disconnect: () => Promise<void> }) {
  this.$disconnect = vi.fn().mockResolvedValue(undefined);
});
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: mockPrismaClientCtor }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn() }));

beforeEach(() => {
  mockPrismaClientCtor.mockClear();
  // @ts-expect-error -- test-only reset of module-scoped globalThis cache
  globalThis.prismaClient = undefined;
  // @ts-expect-error
  globalThis.prismaClientUrl = undefined;
});

describe("prisma proxy", () => {
  test("builds a client lazily on first property access, not at import time", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    expect(mockPrismaClientCtor).not.toHaveBeenCalled();
    const { prisma } = await import("./prisma");
    void prisma.$disconnect; // trigger the Proxy's get trap
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(1);
  });

  test("reuses the same client when the URL is unchanged", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    const { prisma } = await import("./prisma");
    void prisma.$disconnect;
    void prisma.$disconnect;
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(1);
  });

  test("rebuilds when the URL changes between accesses", async () => {
    mockGetDatabaseUrl.mockReturnValue("postgresql://a/db1");
    const { prisma } = await import("./prisma");
    void prisma.$disconnect;
    mockGetDatabaseUrl.mockReturnValue("postgresql://b/db2");
    void prisma.$disconnect;
    expect(mockPrismaClientCtor).toHaveBeenCalledTimes(2);
  });
});
