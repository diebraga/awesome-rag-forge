import { notFound } from "next/navigation";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  if (!isTestingSurfaceEnabled()) {
    notFound();
  }

  const { default: CollectionsPageClient } = await import("./collections-page-client");
  return <CollectionsPageClient />;
}
