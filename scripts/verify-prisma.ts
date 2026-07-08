import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const [collections, documents, chunks] = await Promise.all([
    prisma.ragCollection.count(),
    prisma.ragDocument.count(),
    prisma.ragChunk.count(),
  ]);

  const sample = await prisma.ragCollection.findFirst({
    where: { id: "rag_collection_sample" },
    select: { name: true },
  });

  if (!sample) {
    throw new Error("Seeded RagCollection sample row was not found.");
  }

  console.log(
    `✅ Connected. Tables verified. collections=${collections}, documents=${documents}, chunks=${chunks}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
