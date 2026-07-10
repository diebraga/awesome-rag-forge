import { notFound } from "next/navigation";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  if (!isTestingSurfaceEnabled()) {
    notFound();
  }

  const { default: CollectionDetailPageClient } = await import("./collection-detail-page-client");
  return <CollectionDetailPageClient params={params} />;
}
