import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl || databaseUrl === "postgresql://user:password@localhost:5432/awesome_rag_forge?schema=public") {
  throw new Error(
    "DATABASE_URL is not configured. Add a Postgres connection string with pgvector enabled before starting the MCP server.",
  );
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
