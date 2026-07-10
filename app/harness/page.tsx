import { notFound } from "next/navigation";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export const dynamic = "force-dynamic";

export default async function HarnessPage() {
  if (!isTestingSurfaceEnabled()) {
    notFound();
  }

  const { default: HarnessPageClient } = await import("./harness-page-client");
  return <HarnessPageClient />;
}
