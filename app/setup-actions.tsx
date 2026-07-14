"use client";

import { useState } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SetupActions({ maskedUrl }: { maskedUrl?: string }) {
  const [status, setStatus] = useState<"idle" | "opening" | "opened" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleOpenTerminal() {
    setStatus("opening");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/setup/open-terminal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setErrorMessage(data.error ?? "Unable to open a terminal.");
        setStatus("error");
        return;
      }
      setStatus("opened");
    } catch {
      setErrorMessage("Unable to reach this server.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <p className="text-sm font-semibold text-black">Run setup</p>
      <p className="text-sm leading-6 text-black/70">
        Opens a terminal in this project and runs <code>npm run setup</code>, which prompts for
        each value with masked input and writes straight to <code>.env</code> — nothing is typed
        here, nothing is sent to this page.
      </p>
      {maskedUrl && (
        <p className="text-sm leading-6 text-black/60">
          Last used database: <code>{maskedUrl}</code>. Credentials are never shown — only the
          host, port, and database name.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleOpenTerminal} disabled={status === "opening"} size="sm">
          <Terminal className="size-4" />
          {status === "opening" ? "Opening…" : "Open setup terminal"}
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          <RefreshCw className="size-4" />
          Check again
        </Button>
      </div>
      {status === "opened" && (
        <p className="text-sm text-black/60">
          Terminal opened. Finish setup there, then click &quot;Check again&quot;.
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-600">
          {errorMessage} Run <code>npm run setup</code> in your own terminal instead, then click
          &quot;Check again&quot;.
        </p>
      )}
    </div>
  );
}
