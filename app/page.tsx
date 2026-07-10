import { notFound } from "next/navigation";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isTestingSurfaceEnabled()) {
    notFound();
  }

  const { default: ChatPageClient } = await import("./chat-page-client");
  return <ChatPageClient />;
}
