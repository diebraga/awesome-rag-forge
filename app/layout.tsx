import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Header } from "@/components/header";
import { PROJECT_NAME } from "@/lib/project";
import { isTestingSurfaceEnabled } from "@/lib/testing-surface";
import { isDeveloperMode } from "@/lib/developer-mode";
import { getDatabaseConnectionStatus } from "@/lib/database-health";
import { loadSavedConnectionValues } from "@/lib/connection-keychain";
import { TestingApiAuthPrompt } from "./testing-api-auth-prompt";
import { DeveloperModeBanner } from "./developer-mode-banner";
import { ConnectionGate } from "./connection-gate";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "Chat UI for a conversational, MCP-managed RAG knowledge base.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const database = await getDatabaseConnectionStatus();
  const testingSurfaceEnabled = database.ok && isTestingSurfaceEnabled();
  const developerMode = isDeveloperMode();

  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col overflow-hidden bg-white">
        {database.ok ? (
          <>
            <Header testingSurfaceEnabled={testingSurfaceEnabled} />
            {developerMode && <DeveloperModeBanner />}
            {testingSurfaceEnabled && <TestingApiAuthPrompt />}
            <div className="relative z-0 min-h-0 flex-1">{children}</div>
          </>
        ) : (
          <ConnectionGate savedValues={loadSavedConnectionValues()} />
        )}
      </body>
    </html>
  );
}
